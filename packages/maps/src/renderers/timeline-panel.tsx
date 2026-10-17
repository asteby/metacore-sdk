// `kind: timeline` detail panel: the record's tracking events (child rows of a
// relation, or the `items` of a capability such as `commerce.shipping.track`).
// Shown as a TrackingTimeline: status, time and — when the events carry
// `lat`/`lng` or a location text — the place, with an "open in map" link.
import * as React from 'react'
import { buildRelationFilterParams, pickItems, resolveCapabilityInput, type PanelRendererProps } from '@asteby/metacore-runtime-react'
import { toTrackingEvents, TrackingTimeline, type TrackingFieldMap } from '../tracking-timeline'
import { useMapLabels, useTimelineLabels } from './shared'

const first = (rows: Array<Record<string, unknown>>, keys: string[]): string | undefined => keys.find((k) => rows.some((r) => r[k] !== undefined && r[k] !== null))

export default function TimelinePanelRenderer({ panel, record, metadata, data, locale, timeZone }: PanelRendererProps) {
    const view = panel.timeline
    const source = view?.source
    const labels = useMapLabels()
    const tl = useTimelineLabels()
    const [rows, setRows] = React.useState<Array<Record<string, unknown>> | null>(null)
    const [error, setError] = React.useState(false)
    const recordId = record.id
    const sig = JSON.stringify([source, recordId])

    React.useEffect(() => {
        if (!view || !source) return
        let cancelled = false
        setRows(null)
        setError(false)
        const run = async (): Promise<Array<Record<string, unknown>>> => {
            if (source.capability) {
                return pickItems(await data.capability(source.capability, resolveCapabilityInput(source.input, record)), source.items)
            }
            if (source.relation) {
                const rel = metadata?.relations?.find((r) => r.name === source.relation)
                if (!rel || recordId === undefined || recordId === null) return []
                const res = await data.list(rel.through, { ...buildRelationFilterParams(rel.foreign_key, String(recordId), rel.scope), per_page: 50, sortBy: view.date_field, order: 'desc' })
                return res.rows
            }
            return []
        }
        run().then(
            (r) => !cancelled && setRows(r),
            () => !cancelled && setError(true),
        )
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, sig, metadata])

    const events = React.useMemo(() => {
        if (!view || !rows) return []
        const fields: TrackingFieldMap = {
            status: view.status_field ?? view.title_field,
            at: view.date_field,
            description: view.status_field ? view.title_field : view.description_field,
            location: first(rows, ['location', 'city', 'place']),
            lat: first(rows, ['lat', 'latitude']),
            lng: first(rows, ['lng', 'lon', 'longitude']),
        }
        return toTrackingEvents(rows, fields)
    }, [view, rows])

    if (!view) return null
    if (error) {
        return (
            <p role="alert" style={{ fontSize: 14 }}>
                {labels.unavailable}
            </p>
        )
    }
    if (!rows) return <div role="status" aria-busy="true" aria-label={labels.loading} style={{ height: 120 }} />
    return <TrackingTimeline events={events} locale={locale} timeZone={timeZone} labels={tl} />
}
