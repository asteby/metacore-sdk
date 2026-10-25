import * as React from 'react'
import { createPortal } from 'react-dom'
import type * as ML from 'maplibre-gl'
import { isValidPoint } from '@asteby/storefront/geo'
import { removeLayers, useMap } from './context'
import { ensureStyles, popupNode, readableOn } from './dom'
import { boundsOf, lineToGeoJSON, pointsToGeoJSON, zonePoints, zonesToGeoJSON } from './geometry'
import { colorFor, DEFAULT_COLOR, safeColor } from './palette'
import { buildChoropleth, toRegionCollection, type ChoroplethLoader, type ChoroplethRegion, type ChoroplethStep, type RegionCollection } from './choropleth'
import type { GeoPoint, MapPointItem, ZoneItem } from './types'

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

export interface ClusterLayerProps {
    points: MapPointItem[]
    /** Group nearby points (default true). Off draws plain circles. */
    cluster?: boolean
    colors?: Record<string, string>
    onSelect?: (item: MapPointItem) => void
    /** Layer id prefix (several layers per map need distinct ids). */
    id?: string
}

/** WebGL points with native clustering — thousands of features, no DOM per point. */
export function ClusterLayer({ points, cluster = true, colors, onSelect, id = 'mcm-points' }: ClusterLayerProps): null {
    const { map, ml, styleVersion } = useMap()
    const latest = React.useRef({ points, colors, onSelect })
    latest.current = { points, colors, onSelect }
    const layerIds = [`${id}-clusters`, `${id}-count`, `${id}-points`]

    React.useEffect(() => {
        map.addSource(id, {
            type: 'geojson',
            data: pointsToGeoJSON(latest.current.points, latest.current.colors) as never,
            cluster,
            clusterRadius: 50,
            clusterMaxZoom: 14,
        })
        map.addLayer({
            id: `${id}-clusters`,
            type: 'circle',
            source: id,
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': DEFAULT_COLOR,
                'circle-radius': ['step', ['get', 'point_count'], 16, 20, 20, 100, 26],
                'circle-stroke-width': 3,
                'circle-stroke-color': '#ffffff',
            },
        })
        if ((map.getStyle() as { glyphs?: string } | undefined)?.glyphs) {
            map.addLayer({
                id: `${id}-count`,
                type: 'symbol',
                source: id,
                filter: ['has', 'point_count'],
                layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
                paint: { 'text-color': '#ffffff' },
            })
        }
        map.addLayer({
            id: `${id}-points`,
            type: 'circle',
            source: id,
            filter: ['!', ['has', 'point_count']],
            paint: {
                'circle-color': ['get', 'color'],
                'circle-radius': 8,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff',
            },
        })
        const onCluster = async (e: ML.MapLayerMouseEvent) => {
            const f = e.features?.[0]
            const src = map.getSource(id) as ML.GeoJSONSource | undefined
            if (!f || !src) return
            try {
                const zoom = await src.getClusterExpansionZoom(f.properties?.cluster_id as number)
                map.easeTo({ center: (f.geometry as unknown as { coordinates: [number, number] }).coordinates, zoom, duration: 300 })
            } catch {
                /* cluster vanished mid-zoom */
            }
        }
        const onPoint = (e: ML.MapLayerMouseEvent) => {
            const f = e.features?.[0]
            if (!f) return
            const item = latest.current.points.find((p) => p.key === f.properties?.key)
            if (!item) return
            new ml.Popup({ offset: 10 }).setLngLat([item.lng, item.lat]).setDOMContent(popupNode(item.label, [{ value: item.statusLabel ?? item.status ?? '' }, ...(item.details ?? [])])).addTo(map)
            latest.current.onSelect?.(item)
        }
        const pointer = () => (map.getCanvas().style.cursor = 'pointer')
        const arrow = () => (map.getCanvas().style.cursor = '')
        map.on('click', `${id}-clusters`, onCluster)
        map.on('click', `${id}-points`, onPoint)
        for (const l of [`${id}-clusters`, `${id}-points`]) {
            map.on('mouseenter', l, pointer)
            map.on('mouseleave', l, arrow)
        }
        return () => {
            for (const l of [`${id}-clusters`, `${id}-points`]) {
                map.off('mouseenter', l, pointer)
                map.off('mouseleave', l, arrow)
            }
            map.off('click', `${id}-clusters`, onCluster)
            map.off('click', `${id}-points`, onPoint)
            removeLayers(map, layerIds, id)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, ml, id, cluster, styleVersion])

    React.useEffect(() => {
        ;(map.getSource(id) as ML.GeoJSONSource | undefined)?.setData(pointsToGeoJSON(points, colors) as never)
    }, [map, id, points, colors, styleVersion])
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
