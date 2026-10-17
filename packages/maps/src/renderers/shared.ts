import * as React from 'react'
import { useTranslation } from 'react-i18next'
import type { TableMetadata } from '@asteby/metacore-runtime-react'
import { colorFor, safeColor } from '../palette'
import { DEFAULT_LABELS, type MapLabels, type PolygonCoords, type ZoneItem } from '../types'
import type { TrackingTimelineLabels } from '../tracking-timeline'
import { DEFAULT_TIMELINE_LABELS } from '../tracking-timeline'

export const MAX_FEATURES = 500

/** Labels through the host's i18n (`metacore.maps.*`), Spanish defaults. */
export function useMapLabels(): MapLabels {
    const { t } = useTranslation()
    return React.useMemo(() => {
        const out = { ...DEFAULT_LABELS }
        for (const k of Object.keys(out) as Array<keyof MapLabels>) out[k] = t(`metacore.maps.${k}`, DEFAULT_LABELS[k]) as string
        return out
    }, [t])
}

export function useTimelineLabels(): TrackingTimelineLabels {
    const { t } = useTranslation()
    return React.useMemo(
        () => ({
            empty: t('metacore.maps.timeline_empty', DEFAULT_TIMELINE_LABELS.empty) as string,
            openInMap: t('metacore.maps.timeline_open_in_map', DEFAULT_TIMELINE_LABELS.openInMap) as string,
            tones: {
                done: t('metacore.maps.tone_done', DEFAULT_TIMELINE_LABELS.tones.done) as string,
                current: t('metacore.maps.tone_current', DEFAULT_TIMELINE_LABELS.tones.current) as string,
                pending: t('metacore.maps.tone_pending', DEFAULT_TIMELINE_LABELS.tones.pending) as string,
                problem: t('metacore.maps.tone_problem', DEFAULT_TIMELINE_LABELS.tones.problem) as string,
            },
        }),
        [t],
    )
}

/** Option colours / labels of a column (`color_by`), as the model's metadata serves them. */
export function statusMaps(metadata: TableMetadata | null | undefined, column: string | undefined) {
    const colors: Record<string, string> = {}
    const names: Record<string, string> = {}
    const col = column ? metadata?.columns?.find((c) => c.key === column) : undefined
    for (const o of col?.options ?? []) {
        const key = String(o.value)
        names[key] = o.label
        colors[key] = safeColor(o.color) ?? colorFor(key)
    }
    return { colors, names }
}

/** First polygon of a GeoJSON Polygon / MultiPolygon column value (object or JSON string). */
export function polygonOf(value: unknown): PolygonCoords | null {
    let g = value
    if (typeof g === 'string') {
        try {
            g = JSON.parse(g)
        } catch {
            return null
        }
    }
    const geo = g as { type?: string; coordinates?: unknown } | null
    if (geo?.type === 'Polygon' && Array.isArray(geo.coordinates)) return geo.coordinates as PolygonCoords
    if (geo?.type === 'MultiPolygon' && Array.isArray(geo.coordinates) && Array.isArray(geo.coordinates[0])) return geo.coordinates[0] as PolygonCoords
    return null
}

export function toZones(rows: Record<string, unknown>[], geometry: string, label?: string, color?: string): ZoneItem[] {
    const out: ZoneItem[] = []
    rows.forEach((r, i) => {
        const polygon = polygonOf(r[geometry])
        if (polygon) out.push({ key: String(r.id ?? i), label: label ? String(r[label] ?? '') : undefined, polygon, color })
    })
    return out
}
