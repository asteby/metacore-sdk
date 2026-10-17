// `kind: map` detail panel: the record's point plus its ordered route stops.
import * as React from 'react'
import { buildRelationFilterParams, type PanelRendererProps } from '@asteby/metacore-runtime-react'
import { toMapFeatures, toRoutePoints } from '@asteby/metacore-runtime-react/views/map'
import { Polyline } from '../layers'
import { MapView } from '../map-view'
import type { MapPointItem } from '../types'
import { MAX_FEATURES, useMapLabels } from './shared'

export default function MapPanelRenderer({ panel, record, metadata, data, locale }: PanelRendererProps) {
    const labels = useMapLabels()
    const view = panel.map
    const route = view?.route
    const rel = route ? metadata?.relations?.find((r) => r.name === route.relation) : undefined
    const [stops, setStops] = React.useState<Array<{ lat: number; lng: number }>>([])
    const recordId = record.id

    React.useEffect(() => {
        if (!route || !rel || recordId === undefined || recordId === null) return
        let cancelled = false
        data
            .list(rel.through, { ...buildRelationFilterParams(rel.foreign_key, String(recordId), rel.scope), per_page: MAX_FEATURES, sortBy: route.order_by, order: 'asc' })
            .then((res) => !cancelled && setStops(toRoutePoints(res.rows, route)))
            .catch(() => undefined)
        return () => {
            cancelled = true
        }
    }, [data, route, rel, recordId])

    const points = React.useMemo<MapPointItem[]>(() => {
        if (!view) return []
        const stopItems = stops.map((s, i) => ({ key: `stop-${i}`, ...s, label: `${labels.point} ${i + 1}`, glyph: String(i + 1) }))
        const own = toMapFeatures([record], { ...view, popup: view.popup ?? [] }).map((f) => ({
            key: f.key,
            lat: f.lat,
            lng: f.lng,
            label: f.popup[0]?.value || labels.point,
            details: f.popup.slice(1).filter((p) => p.value).map((p) => ({ label: p.field, value: p.value })),
        }))
        return [...stopItems, ...own]
    }, [view, stops, record, labels.point])

    if (!view) return null
    return (
        <MapView points={points} height={260} labels={labels} locale={locale} cluster={false}>
            {stops.length > 1 ? <Polyline path={stops} /> : null}
        </MapView>
    )
}
