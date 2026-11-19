import * as React from 'react'
import { createPortal } from 'react-dom'
import type * as ML from 'maplibre-gl'
import { isValidPoint } from '@asteby/storefront/geo'
import { removeLayers, useMap } from './context'
import { ensureStyles, listNode, popupNode, readableOn, tooltipNode } from './dom'
import { openSpider, SPIDER_MAX, type Spider } from './spiderfy'
import { allCoincident, areaGroups, boundsOf, isApproximate, lineToGeoJSON, pointColor, pointsToAreas, pointsToGeoJSON, sameSpot, zonePoints, zonesToGeoJSON } from './geometry'
import { colorFor, DEFAULT_COLOR, safeColor } from './palette'
import { buildChoropleth, toRegionCollection, type ChoroplethLoader, type ChoroplethRegion, type ChoroplethStep, type RegionCollection } from './choropleth'
import { pointsPaint } from './theme'
import { DEFAULT_LABELS, type GeoPoint, type MapLabels, type MapPointItem, type ZoneItem } from './types'

/** Auto-cluster above this many points (DOM markers stay focusable below it). */
export const CLUSTER_THRESHOLD = 150

/** Fit the viewport to `points` when their set changes (instant under reduced motion). */
export function useFitBounds(points: ReadonlyArray<GeoPoint | null | undefined>, enabled = true, maxZoom = 15): void {
    const { map, reducedMotion } = useMap()
    const valid = points.filter((p): p is GeoPoint => isValidPoint(p))
    const sig = valid.map((p) => `${p.lat},${p.lng}`).join('|')
    React.useEffect(() => {
        if (!enabled) return
        const b = boundsOf(valid)
        if (!b) return
        const duration = reducedMotion ? 0 : 400
        if (b[0][0] === b[1][0] && b[0][1] === b[1][1]) map.easeTo({ center: b[0], zoom: Math.min(14, maxZoom), duration })
        else map.fitBounds(b, { padding: 48, maxZoom, duration })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, sig, enabled, reducedMotion, maxZoom])
}

// --- Marker ---------------------------------------------------------------

export interface MarkerProps {
    lat: number
    lng: number
    /** Accessible name (required: markers are buttons). */
    label: string
    color?: string
    /** Status key: tints the marker when `color` is not set. */
    status?: string
    /** One or two characters inside the pin (stop number, initial…). */
    glyph?: string
    draggable?: boolean
    selected?: boolean
    /** Popup content (opens on click / Enter / Space). */
    children?: React.ReactNode
    onClick?: () => void
    onDragEnd?: (p: GeoPoint) => void
}

/** A focusable DOM marker with an optional popup. Keep to a few hundred; use `ClusterLayer` beyond that. */
export function Marker(props: MarkerProps): React.ReactElement | null {
    const { map, ml } = useMap()
    const { lat, lng, label, color, status, glyph, draggable, selected, children } = props
    const handlers = React.useRef(props)
    handlers.current = props
    const markerRef = React.useRef<ML.Marker | null>(null)
    const elRef = React.useRef<HTMLButtonElement | null>(null)
    const [popupHost, setPopupHost] = React.useState<HTMLElement | null>(null)
    const hasPopup = children !== undefined && children !== null && children !== false

    React.useEffect(() => {
        ensureStyles()
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'mcm-marker'
        el.addEventListener('click', () => handlers.current.onClick?.())
        elRef.current = el
        const marker = new ml.Marker({ element: el, draggable: !!draggable }).setLngLat([lng, lat]).addTo(map)
        marker.on?.('dragend', () => {
            const ll = marker.getLngLat()
            handlers.current.onDragEnd?.({ lat: ll.lat, lng: ll.lng })
        })
        markerRef.current = marker
        return () => {
            marker.remove()
            markerRef.current = null
            elRef.current = null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, ml, !!draggable])

    React.useEffect(() => {
        markerRef.current?.setLngLat([lng, lat])
    }, [lat, lng])

    React.useEffect(() => {
        const el = elRef.current
        if (!el) return
        const bg = safeColor(color) ?? colorFor(status)
        el.style.background = bg
        el.style.color = readableOn(bg)
        el.textContent = glyph ?? ''
        el.setAttribute('aria-label', label)
        el.setAttribute('aria-pressed', selected ? 'true' : 'false')
    }, [label, color, status, glyph, selected])

    React.useEffect(() => {
        const marker = markerRef.current
        if (!marker || !hasPopup) return
        const host = document.createElement('div')
        const popup = new ml.Popup({ offset: 18, closeButton: true }).setDOMContent(host)
        marker.setPopup(popup)
        setPopupHost(host)
        return () => {
            marker.setPopup(null as unknown as ML.Popup)
            setPopupHost(null)
        }
    }, [ml, map, hasPopup])

    return popupHost ? createPortal(children, popupHost) : null
}

// --- Clustered points -----------------------------------------------------

/** Radio de los puntos por zoom (parada: [zoom, radio px]). */
export const POINT_RADIUS_STOPS: ReadonlyArray<readonly [number, number]> = [[3, 7], [10, 9], [14, 11]]

/** Expresion de radio por zoom con un margen extra: SIEMPRE un 'interpolate' de nivel superior (requisito de MapLibre). */
export function zoomRadius(extra: number): ML.ExpressionSpecification {
    return ['interpolate', ['linear'], ['zoom'], ...POINT_RADIUS_STOPS.flatMap(([z, r]) => [z, r + extra])] as ML.ExpressionSpecification
}

export interface ClusterLayerProps {
    points: MapPointItem[]
    /** Group nearby points (default true). Off draws plain circles. */
    cluster?: boolean
    colors?: Record<string, string>
    onSelect?: (item: MapPointItem) => void
    /** Layer id prefix (several layers per map need distinct ids). */
    id?: string
    /** Hover / list texts (`clusterCount`, `moreItems`); Spanish by default. */
    labels?: Pick<MapLabels, 'clusterCount' | 'moreItems'>
}

/** Highest zoom a cluster click flies to; members that only separate beyond it are revealed in place instead. */
export const CLUSTER_MAX_EXPAND_ZOOM = 14
/** Members named in a cluster list popup (the rest is "+N más"). */
const CLUSTER_LIST_LIMIT = 10

const fill = (template: string, n: number): string => template.replace('{n}', String(n))
const coordsOf = (f: ML.MapGeoJSONFeature): [number, number] => (f.geometry as unknown as { coordinates: [number, number] }).coordinates

/** Popup of one point: its name, the status as a coloured pill and the detail rows. */
function pointPopup(item: MapPointItem, colors?: Record<string, string>): HTMLElement {
    const status = item.statusLabel ?? item.status
    return popupNode(item.label, item.details ?? [], status ? { text: status, color: pointColor(item, colors) } : undefined)
}

/**
 * WebGL points with native clustering — thousands of features, no DOM per point.
 * Approximate points (`precision: 'city' | 'country'`) are not drawn one by one:
 * each location becomes one count bubble. Members that share a spot are revealed
 * by a spiderfy fan (a list when there are too many), never by zooming.
 */
export function ClusterLayer({ points, cluster = true, colors, onSelect, id = 'mcm-points', labels = DEFAULT_LABELS }: ClusterLayerProps): null {
    const { map, ml, scheme, styleVersion } = useMap()
    const latest = React.useRef({ points, colors, onSelect, labels })
    latest.current = { points, colors, onSelect, labels }
    const areaId = `${id}-areas`
    const exact = React.useMemo(() => points.filter((p) => !isApproximate(p)), [points])
    const layerIds = [`${id}-clusters`, `${id}-count`, `${id}-halo`, `${id}-points`]
    const areaLayerIds = [`${areaId}-halo`, areaId, `${areaId}-count`]

    React.useEffect(() => {
        const paint = pointsPaint(scheme)
        const glyphs = !!(map.getStyle() as { glyphs?: string } | undefined)?.glyphs
        const { points: all, colors: cols } = latest.current
        map.addSource(id, {
            type: 'geojson',
            data: pointsToGeoJSON(all.filter((p) => !isApproximate(p)), cols) as never,
            cluster,
            clusterRadius: 50,
            clusterMaxZoom: CLUSTER_MAX_EXPAND_ZOOM,
        })
        map.addLayer({
            id: `${id}-clusters`,
            type: 'circle',
            source: id,
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': paint.clusterColor,
                'circle-radius': ['step', ['get', 'point_count'], 18, 20, 22, 100, 28],
                'circle-stroke-width': paint.clusterStrokeWidth,
                'circle-stroke-color': paint.stroke,
            },
        })
        if (glyphs) {
            map.addLayer({
                id: `${id}-count`,
                type: 'symbol',
                source: id,
                filter: ['has', 'point_count'],
                layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
                paint: { 'text-color': paint.clusterText },
            })
        }
        // MapLibre solo admite ['zoom'] como entrada de un 'interpolate'/'step' de NIVEL SUPERIOR: no se puede
        // anidar en ['+', ...]. El halo (radio + margen) se construye con sus propias paradas.
        const pointRadius = zoomRadius(0)
        map.addLayer({
            id: `${id}-halo`,
            type: 'circle',
            source: id,
            filter: ['!', ['has', 'point_count']],
            paint: { 'circle-color': paint.halo, 'circle-radius': zoomRadius(6), 'circle-blur': 0.5 },
        })
        map.addLayer({
            id: `${id}-points`,
            type: 'circle',
            source: id,
            filter: ['!', ['has', 'point_count']],
            paint: {
                'circle-color': ['get', 'color'],
                // Never smaller than 7 px, so lone points stay visible zoomed out.
                'circle-radius': pointRadius,
                'circle-stroke-width': paint.pointStrokeWidth,
                'circle-stroke-color': paint.stroke,
            },
        })
        // One bubble per approximate location, sized by how many share it.
        map.addSource(areaId, { type: 'geojson', data: pointsToAreas(all) as never })
        map.addLayer({
            id: `${areaId}-halo`,
            type: 'circle',
            source: areaId,
            paint: { 'circle-color': paint.halo, 'circle-radius': ['+', ['get', 'r'], 8], 'circle-blur': 0.5 },
        })
        map.addLayer({
            id: areaId,
            type: 'circle',
            source: areaId,
            paint: {
                'circle-color': paint.clusterColor,
                'circle-radius': ['get', 'r'],
                'circle-stroke-width': paint.clusterStrokeWidth,
                'circle-stroke-color': paint.stroke,
            },
        })
        if (glyphs) {
            map.addLayer({
                id: `${areaId}-count`,
                type: 'symbol',
                source: areaId,
                layout: { 'text-field': ['get', 'text'], 'text-size': 12, 'text-allow-overlap': true },
                paint: { 'text-color': paint.clusterText },
            })
        }

        let popup: ML.Popup | null = null
        let spider: Spider | null = null
        const closeAll = () => {
            popup?.remove()
            spider?.close()
            popup = spider = null
        }
        const showPoint = (item: MapPointItem, offset?: [number, number]) => {
            popup?.remove()
            // From a fan pin the popup hangs off the pin, not off the shared anchor.
            popup = new ml.Popup({ offset: offset ? [offset[0], offset[1] - 16] : 10, maxWidth: '300px' })
                .setLngLat([item.lng, item.lat])
                .setDOMContent(pointPopup(item, latest.current.colors))
                .addTo(map)
            latest.current.onSelect?.(item)
        }
        const showList = (center: [number, number], members: MapPointItem[], total: number) => {
            const list = new ml.Popup({ offset: 14, maxWidth: '300px' })
            popup = list
            const shown = members.slice(0, CLUSTER_LIST_LIMIT)
            const rows = shown.map((it) => ({
                label: it.label,
                status: it.statusLabel ?? it.status,
                color: pointColor(it, latest.current.colors),
                onPick: () => {
                    list.remove()
                    showPoint(it)
                },
            }))
            const l = latest.current.labels
            list.setLngLat(center).setDOMContent(listNode(fill(l.clusterCount, total), rows, total > rows.length ? fill(l.moreItems, total - rows.length) : undefined)).addTo(map)
        }
        /** Several members on one spot: a fan up to SPIDER_MAX, a list beyond; a single one is just its popup. */
        const reveal = (center: [number, number], members: MapPointItem[], total: number) => {
            closeAll()
            if (members.length === 1) showPoint(members[0] as MapPointItem)
            else if (total <= SPIDER_MAX) {
                spider = openSpider(map, ml, { center, members, colors: latest.current.colors, onPick: showPoint, onClose: () => (spider = null) })
            } else showList(center, members, total)
        }

        const onCluster = async (e: ML.MapLayerMouseEvent) => {
            const f = e.features?.[0]
            const src = map.getSource(id) as ML.GeoJSONSource | undefined
            if (!f || !src) return
            const clusterId = f.properties?.cluster_id as number
            const count = Number(f.properties?.point_count) || 0
            const center = coordsOf(f)
            try {
                const zoom = await src.getClusterExpansionZoom(clusterId)
                let members: MapPointItem[] = []
                try {
                    const byKey = new Map(latest.current.points.map((p) => [p.key, p]))
                    const leaves = await src.getClusterLeaves(clusterId, SPIDER_MAX, 0)
                    members = leaves.flatMap((l) => byKey.get(l.properties?.key as string) ?? [])
                } catch {
                    /* leaves unavailable: fall back to zooming */
                }
                // Points on the very same coordinates never split, so zooming only shows empty map: reveal them in place.
                const stuck = zoom > CLUSTER_MAX_EXPAND_ZOOM || (count <= SPIDER_MAX && allCoincident(members))
                if (stuck && members.length) return reveal(center, members, count)
                map.easeTo({ center, zoom: Math.min(zoom, CLUSTER_MAX_EXPAND_ZOOM), duration: 300 })
            } catch {
                /* cluster vanished mid-zoom */
            }
        }
        const onPoint = (e: ML.MapLayerMouseEvent) => {
            const key = e.features?.[0]?.properties?.key
            const pts = latest.current.points
            const item = pts.find((p) => p.key === key)
            if (!item) return
            const sameSpotAs = pts.filter((p) => !isApproximate(p) && sameSpot(p, item))
            if (sameSpotAs.length > 1) reveal([item.lng, item.lat], sameSpotAs, sameSpotAs.length)
            else {
                closeAll()
                showPoint(item)
            }
        }
        const onArea = (e: ML.MapLayerMouseEvent) => {
            const f = e.features?.[0]
            const members = f ? areaGroups(latest.current.points).get(String(f.properties?.gid)) : undefined
            if (f && members) reveal(coordsOf(f), members, members.length)
        }

        // Hover: a light, non-interactive tooltip (the click popup/fan stays the accessible path).
        const tip = new ml.Popup({ closeButton: false, closeOnClick: false, offset: 14, className: 'mcm-tooltip' })
        const hover = (e: ML.MapLayerMouseEvent) => {
            const f = e.features?.[0]
            map.getCanvas().style.cursor = 'pointer'
            if (!f) return
            const group = f.properties?.gid !== undefined
            const count = Number(f.properties?.point_count ?? f.properties?.count) || 0
            const item = count ? undefined : latest.current.points.find((p) => p.key === f.properties?.key)
            const body = count
                ? tooltipNode(fill(latest.current.labels.clusterCount, count), group ? String(f.properties?.area ?? '') : undefined)
                : tooltipNode(item?.label ?? String(f.properties?.label ?? ''), item?.statusLabel ?? item?.status ?? (f.properties?.status as string | undefined))
            tip.setLngLat(coordsOf(f)).setDOMContent(body).addTo(map)
        }
        const leave = () => {
            map.getCanvas().style.cursor = ''
            tip.remove()
        }
        const targets: Array<[string, (e: ML.MapLayerMouseEvent) => void]> = [
            [`${id}-clusters`, onCluster],
            [`${id}-points`, onPoint],
            [areaId, onArea],
        ]
        for (const [layer, onClick] of targets) {
            map.on('click', layer, onClick)
            map.on('mouseenter', layer, hover)
            map.on('mouseleave', layer, leave)
        }
        return () => {
            for (const [layer, onClick] of targets) {
                map.off('click', layer, onClick)
                map.off('mouseenter', layer, hover)
                map.off('mouseleave', layer, leave)
            }
            tip.remove()
            closeAll()
            removeLayers(map, areaLayerIds, areaId)
            removeLayers(map, layerIds, id)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, ml, id, cluster, scheme, styleVersion])

    React.useEffect(() => {
        ;(map.getSource(id) as ML.GeoJSONSource | undefined)?.setData(pointsToGeoJSON(exact, colors) as never)
        ;(map.getSource(areaId) as ML.GeoJSONSource | undefined)?.setData(pointsToAreas(points) as never)
    }, [map, id, areaId, points, exact, colors, styleVersion])
    return null
}

// --- Polyline / Route -----------------------------------------------------

export interface PolylineProps {
    path: GeoPoint[]
    color?: string
    width?: number
    dashed?: boolean
    /** Fit the viewport to the path. */
    fit?: boolean
    id?: string
}

/** A line over ordered points (straight segments: no routing service needed). */
export function Polyline({ path, color, width = 4, dashed, fit, id = 'mcm-line' }: PolylineProps): null {
    const { map, styleVersion } = useMap()
    const latest = React.useRef(path)
    latest.current = path
    React.useEffect(() => {
        map.addSource(id, { type: 'geojson', data: lineToGeoJSON(latest.current) as never })
        map.addLayer({
            id,
            type: 'line',
            source: id,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
                'line-color': safeColor(color) ?? DEFAULT_COLOR,
                'line-width': width,
                ...(dashed ? { 'line-dasharray': [2, 2] } : {}),
            },
        })
        return () => removeLayers(map, [id], id)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, id, color, width, dashed, styleVersion])
    React.useEffect(() => {
        ;(map.getSource(id) as ML.GeoJSONSource | undefined)?.setData(lineToGeoJSON(path) as never)
    }, [map, id, path, styleVersion])
    useFitBounds(path, !!fit)
    return null
}

export interface RouteProps extends PolylineProps {
    /** Numbered stop markers along the path (default true). */
    stops?: boolean
    /** Accessible name of each stop: `${stopLabel} ${n}`. Default "Parada". */
    stopLabel?: string
}

/** A route: the line plus numbered, focusable stops (the list alternative gets them as points). */
export function Route({ path, stops = true, stopLabel = 'Parada', ...line }: RouteProps): React.ReactElement {
    const valid = path.filter((p) => isValidPoint(p))
    return (
        <>
            <Polyline path={valid} {...line} />
            {stops
                ? valid.map((p, i) => (
                      <Marker key={`${p.lat},${p.lng},${i}`} lat={p.lat} lng={p.lng} glyph={String(i + 1)} label={`${stopLabel} ${i + 1}`} color={safeColor(line.color)} />
                  ))
                : null}
        </>
    )
}

// --- Geofence -------------------------------------------------------------

export interface GeofenceProps {
    zones: ZoneItem[]
    fit?: boolean
    opacity?: number
    onSelect?: (zone: ZoneItem) => void
    id?: string
}

/** Coverage zones: polygons and/or circles (`center` + `radiusM`). */
export function Geofence({ zones, fit, opacity = 0.18, onSelect, id = 'mcm-zones' }: GeofenceProps): null {
    const { map, ml, styleVersion } = useMap()
    const latest = React.useRef({ zones, onSelect })
    latest.current = { zones, onSelect }
    React.useEffect(() => {
        map.addSource(id, { type: 'geojson', data: zonesToGeoJSON(latest.current.zones) as never })
        map.addLayer({ id: `${id}-fill`, type: 'fill', source: id, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': opacity } })
        map.addLayer({ id: `${id}-line`, type: 'line', source: id, paint: { 'line-color': ['get', 'color'], 'line-width': 2 } })
        const onClick = (e: ML.MapLayerMouseEvent) => {
            const key = e.features?.[0]?.properties?.key
            const z = latest.current.zones.find((x) => x.key === key)
            if (!z) return
            if (z.label) new ml.Popup().setLngLat(e.lngLat).setDOMContent(popupNode(z.label)).addTo(map)
            latest.current.onSelect?.(z)
        }
        map.on('click', `${id}-fill`, onClick)
        return () => {
            map.off('click', `${id}-fill`, onClick)
            removeLayers(map, [`${id}-fill`, `${id}-line`], id)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, ml, id, opacity, styleVersion])
    React.useEffect(() => {
        ;(map.getSource(id) as ML.GeoJSONSource | undefined)?.setData(zonesToGeoJSON(zones) as never)
    }, [map, id, zones, styleVersion])
    useFitBounds(React.useMemo(() => (fit ? zonePoints(zones) : []), [fit, zones]), !!fit)
    return null
}

// --- Choropleth -----------------------------------------------------------

export interface ChoroplethOptions {
    /** Lazy geometry (GeoJSON or TopoJSON), supplied by the host or region: the SDK ships none. Called once, on mount. */
    loader: ChoroplethLoader
    /** Value per region key. */
    values: Record<string, number>
    /** Feature property (or `id`) that matches the `values` keys. Default `key`. */
    keyProperty?: string
    /** Feature property with the display name. Default `name`. */
    labelProperty?: string
    /** TopoJSON object to draw (default: the first). */
    object?: string
    /** Number of colour classes (2–9). Default 5. */
    steps?: number
    /** Hex base colour of the ramp (default: the palette blue). */
    color?: string
}

export interface ChoroplethState {
    status: 'loading' | 'ready' | 'error'
    regions: ChoroplethRegion[]
    steps: ChoroplethStep[]
    collection: RegionCollection | null
}

/**
 * Loads the geometry once (on mount) and joins it with `values`. Usable
 * outside a map too: it feeds `<ChoroplethList>`, the accessible equivalent.
 */
export function useChoropleth({ loader, values, keyProperty, labelProperty, object, steps, color }: ChoroplethOptions): ChoroplethState {
    const [geo, setGeo] = React.useState<RegionCollection | null>(null)
    const [failed, setFailed] = React.useState(false)
    const loaderRef = React.useRef(loader)
    loaderRef.current = loader
    React.useEffect(() => {
        let alive = true
        loaderRef
            .current()
            .then((g) => alive && setGeo(toRegionCollection(g, object)))
            .catch(() => alive && setFailed(true))
        return () => {
            alive = false
        }
    }, [object])
    return React.useMemo(() => {
        if (!geo) return { status: failed ? 'error' : 'loading', regions: [], steps: [], collection: null }
        return { status: 'ready', ...buildChoropleth(geo, values, { keyProperty, labelProperty, steps, color }) }
    }, [geo, failed, values, keyProperty, labelProperty, steps, color])
}

export interface ChoroplethLayerProps extends ChoroplethOptions {
    opacity?: number
    /** Receives the joined regions (label + value) to feed <ChoroplethList>. */
    onRegions?: (state: ChoroplethState) => void
    onSelect?: (region: ChoroplethRegion) => void
    id?: string
}

/** Regions shaded by value. The geometry is fetched when this mounts, never before. */
export function ChoroplethLayer({ opacity = 0.75, onRegions, onSelect, id = 'mcm-choropleth', ...opts }: ChoroplethLayerProps): null {
    const { map, ml, styleVersion } = useMap()
    const state = useChoropleth(opts)
    const latest = React.useRef({ state, onSelect, onRegions })
    latest.current = { state, onSelect, onRegions }
    React.useEffect(() => {
        latest.current.onRegions?.(state)
    }, [state])
    const data = state.collection
    React.useEffect(() => {
        if (!data) return
        map.addSource(id, { type: 'geojson', data: latest.current.state.collection as never })
        map.addLayer({ id: `${id}-fill`, type: 'fill', source: id, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': opacity } })
        map.addLayer({ id: `${id}-line`, type: 'line', source: id, paint: { 'line-color': '#FFFFFF', 'line-width': 1 } })
        const onClick = (e: ML.MapLayerMouseEvent) => {
            const key = e.features?.[0]?.properties?.key
            const r = latest.current.state.regions.find((x) => x.key === key)
            if (!r) return
            new ml.Popup().setLngLat(e.lngLat).setDOMContent(popupNode(r.value === undefined ? r.label : `${r.label}: ${r.value}`)).addTo(map)
            latest.current.onSelect?.(r)
        }
        map.on('click', `${id}-fill`, onClick)
        return () => {
            map.off('click', `${id}-fill`, onClick)
            removeLayers(map, [`${id}-fill`, `${id}-line`], id)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, ml, id, opacity, styleVersion, !!data])
    React.useEffect(() => {
        if (data) (map.getSource(id) as ML.GeoJSONSource | undefined)?.setData(data as never)
    }, [map, id, data, styleVersion])
    return null
}

export interface ChoroplethListProps {
    regions: ChoroplethRegion[]
    /** Accessible name of the list, e.g. "Ventas por estado". */
    label: string
    /** Text for regions without a value. */
    noData: string
    formatValue?: (v: number) => string
    /** Sort by value, highest first (default: the geometry order). */
    sortByValue?: boolean
    id?: string
}

/** Accessible equivalent of the choropleth: every region with its value written out (colour is never the only channel). */
export function ChoroplethList({ regions, label, noData, formatValue = String, sortByValue, id }: ChoroplethListProps): React.ReactElement {
    const rows = sortByValue ? [...regions].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity)) : regions
    return (
        <table id={id} data-testid="choropleth-list" style={{ borderCollapse: 'collapse', width: '100%' }}>
            <caption style={{ textAlign: 'left', fontWeight: 600, padding: '4px 0' }}>{label}</caption>
            <tbody>
                {rows.map((r) => (
                    <tr key={r.key} style={{ borderBottom: '1px solid rgba(128,128,128,.25)' }}>
                        <th scope="row" style={{ textAlign: 'left', fontWeight: 400, padding: '6px 0' }}>
                            <span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, marginRight: 8, background: r.color, border: '1px solid rgba(128,128,128,.5)' }} />
                            {r.label}
                        </th>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.value === undefined ? noData : formatValue(r.value)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}
