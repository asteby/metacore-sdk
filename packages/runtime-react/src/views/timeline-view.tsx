// `view_type: timeline` (a model's rows over time) and `kind: timeline` detail
// panels (a record's child rows, or the items of a capability query such as
// `commerce.shipping.track`). Lazy chunk. Dates are formatted, never computed:
// ETAs and statuses are whatever the server returned.
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button } from '@asteby/metacore-ui/primitives'
import type { TimelineView } from '@asteby/metacore-sdk'
import { buildRelationFilterParams } from '../dynamic-relation-helpers'
import type { PanelRendererProps, ViewRendererProps } from './types'
import {
    displayValue,
    pickItems,
    resolveCapabilityInput,
    sortByDate,
    toDate,
} from './data-source'
import { ViewSkeleton } from './skeleton'

const PAGE = 50

export interface TimelineEntry {
    key: string
    at: Date | null
    title: string
    status?: string
    description?: string
    group?: string
    row: Record<string, unknown>
}

/** Pure: rows → ordered entries (newest first), grouped when `group_by` is set. */
export function toTimelineEntries(rows: Record<string, unknown>[], view: TimelineView): TimelineEntry[] {
    return sortByDate(rows, view.date_field).map((row, i) => ({
        key: String(row.id ?? `${i}`),
        at: toDate(row[view.date_field]),
        title: displayValue(row[view.title_field]),
        status: view.status_field ? displayValue(row[view.status_field]) || undefined : undefined,
        description: view.description_field ? displayValue(row[view.description_field]) || undefined : undefined,
        group: view.group_by ? displayValue(row[view.group_by]) || undefined : undefined,
        row,
    }))
}

function useFormatter(locale?: string, timeZone?: string) {
    return React.useMemo(() => {
        try {
            return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone })
        } catch {
            return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
        }
    }, [locale, timeZone])
}

export function TimelineList({
    entries,
    locale,
    timeZone,
    onOpen,
}: {
    entries: TimelineEntry[]
    locale?: string
    timeZone?: string
    onOpen?: (row: Record<string, unknown>) => void
}) {
    const { t } = useTranslation()
    const fmt = useFormatter(locale, timeZone)
    if (entries.length === 0) {
        return (
            <p className="py-8 text-center text-sm text-muted-foreground" data-testid="timeline-empty">
                {t('metacore.views.empty', 'Sin datos todavía.')}
            </p>
        )
    }
    let lastGroup: string | undefined
    return (
        <ol className="relative space-y-4 border-l border-border pl-5" data-testid="timeline">
            {entries.map((e) => {
                const header = e.group !== undefined && e.group !== lastGroup ? e.group : undefined
                lastGroup = e.group
                const body = (
                    <>
                        <span
                            aria-hidden
                            className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{e.title}</span>
                            {e.status ? <Badge variant="outline">{e.status}</Badge> : null}
                        </div>
                        {e.at ? (
                            <time dateTime={e.at.toISOString()} className="block text-xs text-muted-foreground">
                                {fmt.format(e.at)}
                            </time>
                        ) : null}
                        {e.description ? <p className="mt-1 text-sm text-muted-foreground">{e.description}</p> : null}
                    </>
                )
                return (
                    <React.Fragment key={e.key}>
                        {header ? (
                            <li className="-ml-5 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {header}
                            </li>
                        ) : null}
                        <li className="relative">
                            {onOpen ? (
                                <button
                                    type="button"
                                    className="w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    onClick={() => onOpen(e.row)}
                                >
                                    {body}
                                </button>
                            ) : (
                                body
                            )}
                        </li>
                    </React.Fragment>
                )
            })}
        </ol>
    )
}

/** `view_type: timeline` on a nav entry: the model's rows, newest first, paged. */
export default function TimelineViewRenderer(props: ViewRendererProps<'timeline'>) {
    const { model, view, data, locale, timeZone, onOpenRecord, className } = props
    const { t } = useTranslation()
    const [rows, setRows] = React.useState<Record<string, unknown>[] | null>(null)
    const [total, setTotal] = React.useState<number | undefined>()
    const [page, setPage] = React.useState(1)
    const [error, setError] = React.useState(false)

    React.useEffect(() => {
        let cancelled = false
        setError(false)
        data
            .list(model, { page, per_page: PAGE, sortBy: view.date_field, order: 'desc' })
            .then((res) => {
                if (cancelled) return
                setRows((prev) => (page === 1 || !prev ? res.rows : [...prev, ...res.rows]))
                setTotal(res.total)
            })
            .catch(() => !cancelled && setError(true))
        return () => {
            cancelled = true
        }
    }, [data, model, view.date_field, page])

    if (error && !rows) {
        return (
            <p role="alert" className="text-sm text-destructive">
                {t('metacore.views.error', 'No se pudo cargar la información.')}
            </p>
        )
    }
    if (!rows) return <ViewSkeleton />
    const entries = toTimelineEntries(rows, view)
    const more = total !== undefined ? rows.length < total : false
    return (
        <div className={className}>
            <TimelineList entries={entries} locale={locale} timeZone={timeZone} onOpen={onOpenRecord} />
            {more ? (
                <div className="mt-4 flex justify-center">
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)}>
                        {t('metacore.views.load_more', 'Cargar más')}
                    </Button>
                </div>
            ) : null}
        </div>
    )
}

/** `kind: timeline` panel: child rows of a relation or a capability's items. */
export function TimelinePanel({ panel, record, metadata, data, locale, timeZone }: PanelRendererProps) {
    const { t } = useTranslation()
    const view = panel.timeline
    const source = view?.source
    const [rows, setRows] = React.useState<Record<string, unknown>[] | null>(null)
    const [error, setError] = React.useState(false)
    const recordId = record.id
    const sig = JSON.stringify([source, recordId])

    React.useEffect(() => {
        if (!view || !source) return
        let cancelled = false
        setRows(null)
        setError(false)
        const run = async (): Promise<Record<string, unknown>[]> => {
            if (source.capability) {
                const out = await data.capability(source.capability, resolveCapabilityInput(source.input, record))
                return pickItems(out, source.items)
            }
            if (source.relation) {
                const rel = metadata?.relations?.find((r) => r.name === source.relation)
                if (!rel || recordId === undefined || recordId === null) return []
                const res = await data.list(rel.through, {
                    ...buildRelationFilterParams(rel.foreign_key, String(recordId), rel.scope),
                    per_page: PAGE,
                    sortBy: view.date_field,
                    order: 'desc',
                })
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

    if (!view) return null
    if (error) {
        return (
            <p role="alert" className="text-sm text-destructive">
                {t('metacore.views.error', 'No se pudo cargar la información.')}
            </p>
        )
    }
    if (!rows) return <ViewSkeleton height={200} />
    return <TimelineList entries={toTimelineEntries(rows, view)} locale={locale} timeZone={timeZone} />
}

