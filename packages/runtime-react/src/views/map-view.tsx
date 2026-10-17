// `view_type: map` and `kind: map` detail panels — CONTRACT + ACCESSIBLE
// FALLBACK. The interactive renderer (MapLibre, clustering, layers, dark
// style) belongs to `@asteby/metacore-maps`, which registers itself with
// `registerViewRenderer('map', …)` / `registerPanelRenderer('map', …)`. Until a
// host does, this chunk renders what every map must offer anyway: the
// equivalent keyboard-navigable list of features, each with an "open in map"
// link. The pure helpers below (features, route) are the shared contract the
// maps package builds on, so both renderers read the manifest identically.
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { MapPin } from 'lucide-react'
import type { MapPoint, MapView } from '@asteby/metacore-sdk'
import { buildRelationFilterParams } from '../dynamic-relation-helpers'
import type { PanelRendererProps, ViewRendererProps } from './types'
import { displayValue } from './data-source'
import { ViewSkeleton } from './skeleton'

const MAX_FEATURES = 500

export interface MapFeature {
    key: string
    lat: number
    lng: number
    /** `color_by` value (option key); the renderer maps it to a token. */
    color?: string
    /** Popup fields in `popup[]` order. */
    popup: Array<{ field: string; value: string }>
    row: Record<string, unknown>
}

function num(v: unknown): number | null {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
    return Number.isFinite(n) ? n : null
}

/** Coordinates of a row: `point {lat,lng}` columns or a GeoJSON Point column. */
export function rowCoordinates(
    row: Record<string, unknown>,
    point: MapPoint | undefined,
    geometry: string | undefined,
): { lat: number; lng: number } | null {
    if (point) {
        const lat = num(row[point.lat])
        const lng = num(row[point.lng])
        if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
        return { lat, lng }
    }
    if (geometry) {
        let g = row[geometry] as unknown
        if (typeof g === 'string') {
            try {
                g = JSON.parse(g)
            } catch {
                return null
            }
        }
        const geo = g as { type?: string; coordinates?: unknown[] } | null
        if (geo?.type === 'Point' && Array.isArray(geo.coordinates)) {
            const lng = num(geo.coordinates[0])
            const lat = num(geo.coordinates[1])
            if (lat !== null && lng !== null) return { lat, lng }
        }
    }
    return null
}

/** Pure: rows → map features (rows without valid coordinates are skipped). */
export function toMapFeatures(rows: Record<string, unknown>[], view: MapView): MapFeature[] {
    const out: MapFeature[] = []
    rows.forEach((row, i) => {
        const c = rowCoordinates(row, view.point, view.geometry)
        if (!c) return
        out.push({
            key: String(row.id ?? i),
            ...c,
            color: view.color_by ? displayValue(row[view.color_by]) || undefined : undefined,
            popup: (view.popup ?? []).map((field) => ({ field, value: displayValue(row[field]) })),
            row,
        })
    })
    return out
}

/** Pure: ordered route points of a record's children (`route.order_by` ascending). */
export function toRoutePoints(
    children: Record<string, unknown>[],
    route: NonNullable<MapView['route']>,
): Array<{ lat: number; lng: number }> {
    return [...children]
        .sort((a, b) => String(a[route.order_by] ?? '').localeCompare(String(b[route.order_by] ?? '')))
        .map((r) => rowCoordinates(r, route.point, undefined))
        .filter((p): p is { lat: number; lng: number } => p !== null)
}

/** "Open in map" link (OpenStreetMap; no key, no tracking script). */
export function openInMapHref(lat: number, lng: number): string {
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`
}

export function MapFeatureList({
    features,
    onOpen,
}: {
    features: MapFeature[]
    onOpen?: (row: Record<string, unknown>) => void
}) {
    const { t } = useTranslation()
    if (features.length === 0) {
        return (
            <p className="py-8 text-center text-sm text-muted-foreground" data-testid="map-empty">
                {t('metacore.views.map_empty', 'No hay ubicaciones para mostrar.')}
            </p>
        )
    }
    return (
        <ul className="divide-y rounded-lg border" data-testid="map-feature-list">
            {features.map((f) => {
                const label = f.popup[0]?.value || f.key
                return (
                    <li key={f.key} className="flex items-start gap-3 p-3">
                        <MapPin aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                            {onOpen ? (
                                <button
                                    type="button"
                                    className="truncate text-left text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    onClick={() => onOpen(f.row)}
                                >
                                    {label}
                                </button>
                            ) : (
                                <span className="truncate text-sm font-medium text-foreground">{label}</span>
                            )}
                            {f.popup.length > 1 || f.color ? (
                                <p className="truncate text-xs text-muted-foreground">
                                    {[f.color, ...f.popup.slice(1).map((p) => p.value)].filter(Boolean).join(' · ')}
                                </p>
                            ) : null}
                        </div>
                        <a
                            href={openInMapHref(f.lat, f.lng)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-xs text-primary underline-offset-2 hover:underline"
                            aria-label={t('metacore.views.open_in_map_of', 'Abrir en mapa: {{label}}', { label })}
                        >
                            {t('metacore.views.open_in_map', 'Abrir en mapa')}
                        </a>
                    </li>
                )
            })}
        </ul>
    )
}

/** `view_type: map` fallback renderer: the accessible list of features. */
export default function MapViewFallback(props: ViewRendererProps<'map'>) {
    const { model, view, data, onOpenRecord, className } = props
    const { t } = useTranslation()
    const [rows, setRows] = React.useState<Record<string, unknown>[] | null>(null)
    const [error, setError] = React.useState(false)
    React.useEffect(() => {
        let cancelled = false
        data
            .list(model, { per_page: MAX_FEATURES })
            .then((res) => !cancelled && setRows(res.rows))
            .catch(() => !cancelled && setError(true))
        return () => {
            cancelled = true
        }
    }, [data, model])
    if (error) {
        return (
            <p role="alert" className="text-sm text-destructive">
                {t('metacore.views.error', 'No se pudo cargar la información.')}
            </p>
        )
    }
    if (!rows) return <ViewSkeleton />
    return (
        <div className={className} data-testid="map-view-fallback">
            <MapFeatureList features={toMapFeatures(rows, view)} onOpen={onOpenRecord} />
        </div>
    )
}

/** `kind: map` panel fallback: the record's point and its route stops. */
export function MapPanel({ panel, record, metadata, data }: PanelRendererProps) {
    const view = panel.map
    const route = view?.route
    const rel = route ? metadata?.relations?.find((r) => r.name === route.relation) : undefined
    const [stops, setStops] = React.useState<Array<{ lat: number; lng: number }>>([])
    const recordId = record.id
    React.useEffect(() => {
        if (!route || !rel || recordId === undefined || recordId === null) return
        let cancelled = false
        data
            .list(rel.through, {
                ...buildRelationFilterParams(rel.foreign_key, String(recordId), rel.scope),
                per_page: MAX_FEATURES,
                sortBy: route.order_by,
                order: 'asc',
            })
            .then((res) => !cancelled && setStops(toRoutePoints(res.rows, route)))
            .catch(() => undefined)
        return () => {
            cancelled = true
        }
    }, [data, route, rel, recordId])
    if (!view) return null
    const own = toMapFeatures([record], { ...view, popup: view.popup ?? [] })
    const features: MapFeature[] = [
        ...stops.map((s, i) => ({ key: `stop-${i}`, ...s, popup: [{ field: '#', value: `#${i + 1}` }], row: {} })),
        ...own,
    ]
    return <MapFeatureList features={features} />
}
