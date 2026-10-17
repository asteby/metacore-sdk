import * as React from 'react'
import type * as ML from 'maplibre-gl'
import { isValidPoint } from '@asteby/storefront/geo'
import {
    ensureProtocols,
    getMapsConfig,
    loadMaplibre,
    resolveStyle,
    supportsWebGL,
    type MapLibreModule,
    type MapScheme,
    type MapStyle,
} from './config'
import { MapContext, type MapContextValue } from './context'
import { ensureStyles } from './dom'
import { CLUSTER_THRESHOLD, ClusterLayer, Marker, useFitBounds } from './layers'
import { MapList } from './map-list'
import { prefersReducedMotion, useMapScheme } from './theme'
import { mergeLabels, type GeoPoint, type MapLabels, type MapPointItem } from './types'

export interface MapViewProps {
    /** Features to draw. They also feed the list alternative. */
    points?: MapPointItem[]
    /** Cluster the points (default: automatic above 150). */
    cluster?: boolean
    /** Status key → colour overrides (e.g. from the model's option colours). */
    colors?: Record<string, string>
    /** Fit the viewport to the points when they change (default true). */
    fit?: boolean
    center?: [number, number]
    zoom?: number
    /** `auto` follows the host theme (`.dark` / `data-theme`) or the OS. */
    theme?: MapScheme | 'auto'
    /** Style override: URL / object, or one per scheme. Default: `configureMaps({ style })`. */
    mapStyle?: MapStyle | { light?: MapStyle; dark?: MapStyle }
    height?: number | string
    className?: string
    ariaLabel?: string
    labels?: Partial<MapLabels>
    selectedKey?: string | null
    onSelect?: (item: MapPointItem) => void
    /** Click on the empty map (e.g. a picker). */
    onMapClick?: (p: GeoPoint) => void
    /** Show the "Ver lista" toggle (default true; the list is still the fallback when the map cannot render). */
    listToggle?: boolean
    /** Extra content in the list region (e.g. zone names). */
    listExtra?: React.ReactNode
    locale?: string
    /** Layers and markers: `<Route>`, `<Polyline>`, `<Geofence>`, `<Marker>`… */
    children?: React.ReactNode
}

type Status = 'loading' | 'ready' | 'unavailable'

function PointsLayer({ points, cluster, colors, selectedKey, onSelect, fit }: Pick<MapViewProps, 'points' | 'cluster' | 'colors' | 'selectedKey' | 'onSelect' | 'fit'>) {
    const pts = React.useMemo(() => (points ?? []).filter((p) => isValidPoint(p)), [points])
    useFitBounds(pts, fit !== false)
    const clustered = cluster ?? pts.length > CLUSTER_THRESHOLD
    if (clustered) return <ClusterLayer points={pts} colors={colors} onSelect={onSelect} />
    return (
        <>
            {pts.map((p) => (
                <Marker
                    key={p.key}
                    lat={p.lat}
                    lng={p.lng}
                    label={p.statusLabel ?? p.status ? `${p.label}, ${p.statusLabel ?? p.status}` : p.label}
                    status={p.status}
                    color={p.color ?? (p.status ? colors?.[p.status] : undefined)}
                    glyph={p.glyph}
                    selected={selectedKey === p.key}
                    onClick={() => onSelect?.(p)}
                >
                    <strong style={{ display: 'block' }}>{p.label}</strong>
                    {p.statusLabel ?? p.status ? <span style={{ display: 'block' }}>{p.statusLabel ?? p.status}</span> : null}
                    {(p.details ?? []).map((d, i) => (
                        <span key={i} style={{ display: 'block' }}>
                            {d.label ? `${d.label}: ${d.value}` : d.value}
                        </span>
                    ))}
                </Marker>
            ))}
        </>
    )
}

/**
 * Interactive map. MapLibre loads on first mount (never in your first paint),
 * the base map comes from `configureMaps({ style })` (no keys), and a list
 * with the same features is always one click away — and the only view when
 * WebGL is missing.
 */
export function MapView(props: MapViewProps): React.ReactElement {
    const { points, theme = 'auto', mapStyle, height = 360, className, ariaLabel, listToggle = true, listExtra, locale, children } = props
    const labels = React.useMemo(() => mergeLabels(props.labels), [props.labels])
    const scheme = useMapScheme(theme)
    const [status, setStatus] = React.useState<Status>('loading')
    const [handle, setHandle] = React.useState<{ map: ML.Map; ml: MapLibreModule } | null>(null)
    const [styleVersion, setStyleVersion] = React.useState(0)
    const [showList, setShowList] = React.useState(false)
    const [selected, setSelected] = React.useState<string | null>(props.selectedKey ?? null)
    const container = React.useRef<HTMLDivElement | null>(null)
    const live = React.useRef({ scheme, mapStyle, onMapClick: props.onMapClick })
    live.current = { scheme, mapStyle, onMapClick: props.onMapClick }
    const reducedMotion = React.useMemo(() => prefersReducedMotion(), [])
    const listId = React.useId()

    React.useEffect(() => {
        if (props.selectedKey !== undefined) setSelected(props.selectedKey)
    }, [props.selectedKey])

    React.useEffect(() => {
        const el = container.current
        if (!el) return
        if (!supportsWebGL()) {
            setStatus('unavailable')
            return
        }
        ensureStyles()
        let cancelled = false
        let map: ML.Map | null = null
        loadMaplibre()
            .then(async (ml) => {
                const style = resolveStyle(live.current.scheme, live.current.mapStyle)
                await ensureProtocols(ml, style)
                if (cancelled) return
                const cfg = getMapsConfig()
                map = new ml.Map({
                    container: el,
                    style,
                    center: props.center ?? cfg.center ?? [-102.5, 23.6],
                    zoom: props.zoom ?? cfg.zoom ?? 4,
                    attributionControl: false,
                })
                map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right')
                map.addControl(new ml.AttributionControl({ compact: true, customAttribution: cfg.attribution }))
                map.on('style.load', () => setStyleVersion((v) => v + 1))
                map.on('click', (e: ML.MapMouseEvent) => {
                    const cb = live.current.onMapClick
                    if (cb && !(e as { defaultPrevented?: boolean }).defaultPrevented) cb({ lat: e.lngLat.lat, lng: e.lngLat.lng })
                })
                const m = map
                m.once('load', () => {
                    if (cancelled) return
                    setHandle({ map: m, ml })
                    setStatus('ready')
                })
            })
            .catch(() => !cancelled && setStatus('unavailable'))
        return () => {
            cancelled = true
            setHandle(null)
            map?.remove()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Theme switch: swap the base style; layers re-add on `style.load`.
    const firstScheme = React.useRef(scheme)
    React.useEffect(() => {
        if (firstScheme.current === scheme || !handle) return
        firstScheme.current = scheme
        const style = resolveStyle(scheme, mapStyle)
        void ensureProtocols(handle.ml, style).then(() => handle.map.setStyle(style, { diff: false }))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scheme, handle])

    const ctx = React.useMemo<MapContextValue | null>(
        () => (handle ? { map: handle.map, ml: handle.ml, scheme, styleVersion, reducedMotion } : null),
        [handle, scheme, styleVersion, reducedMotion],
    )

    const select = React.useCallback(
        (item: MapPointItem) => {
            setSelected(item.key)
            props.onSelect?.(item)
            handle?.map.easeTo({ center: [item.lng, item.lat], zoom: Math.max(handle.map.getZoom(), 13), duration: reducedMotion ? 0 : 400 })
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [handle, reducedMotion, props.onSelect],
    )

    const unavailable = status === 'unavailable'
    const listVisible = unavailable || showList
    const items = React.useMemo(() => (points ?? []).filter((p) => isValidPoint(p)), [points])

    return (
        <div className={['mcm-root', scheme === 'dark' ? 'mcm-dark' : '', className].filter(Boolean).join(' ')} data-testid="metacore-map" data-status={status} data-scheme={scheme}>
            {unavailable ? (
                <p role="status" data-testid="map-unavailable" style={{ margin: '0 0 8px', fontSize: 13, opacity: 0.8 }}>
                    {labels.unavailable}
                </p>
            ) : (
                <div style={{ position: 'relative', height, width: '100%' }}>
                    <div ref={container} role="region" aria-label={ariaLabel ?? labels.map} aria-busy={status === 'loading'} style={{ position: 'absolute', inset: 0, borderRadius: 8, overflow: 'hidden' }} />
                    {status === 'loading' ? (
                        <p role="status" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', margin: 0, pointerEvents: 'none', fontSize: 13, opacity: 0.7 }}>
                            {labels.loading}
                        </p>
                    ) : null}
                </div>
            )}
            {ctx ? (
                <MapContext.Provider value={ctx}>
                    <PointsLayer points={points} cluster={props.cluster} colors={props.colors} selectedKey={selected} onSelect={select} fit={props.fit} />
                    {children}
                </MapContext.Provider>
            ) : null}
            {listToggle && !unavailable ? (
                <button type="button" aria-expanded={showList} aria-controls={listId} onClick={() => setShowList((v) => !v)} style={{ marginTop: 8, fontSize: 13 }}>
                    {showList ? labels.hideList : labels.showList}
                </button>
            ) : null}
            {listVisible ? (
                <div id={listId} style={{ marginTop: 8 }}>
                    <MapList items={items} labels={labels} selectedKey={selected} locale={locale} onSelect={unavailable ? undefined : select} />
                    {listExtra}
                </div>
            ) : null}
        </div>
    )
}
