// `kind: relation` and `kind: stats` detail panels. Lazy chunk. Both only
// display server values: a relation panel lists the record's children (first
// `limit` rows), a stats panel formats a few of the record's own fields.
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { buildRelationFilterParams } from '../dynamic-relation-helpers'
import type { PanelRendererProps } from './types'
import { displayValue, toDate } from './data-source'
import { ViewSkeleton } from './skeleton'

export type StatFormat =
    | 'number'
    | 'currency'
    | 'percent'
    | 'compact'
    | 'date'
    | 'datetime'
    | 'relative_date'

/** Pure: format one stat value for display. `now` is injectable for tests. */
export function formatStat(
    value: unknown,
    format: string | undefined,
    opts: { locale?: string; currency?: string; timeZone?: string; now?: Date } = {},
): string {
    if (value === null || value === undefined || value === '') return '—'
    const { locale, currency, timeZone } = opts
    const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
    try {
        switch (format as StatFormat | undefined) {
            case 'currency':
                if (Number.isNaN(num)) break
                return new Intl.NumberFormat(locale, { style: 'currency', currency: currency || 'MXN' }).format(num)
            case 'percent':
                if (Number.isNaN(num)) break
                return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(num)
            case 'compact':
                if (Number.isNaN(num)) break
                return new Intl.NumberFormat(locale, { notation: 'compact' }).format(num)
            case 'number':
                if (Number.isNaN(num)) break
                return new Intl.NumberFormat(locale).format(num)
            case 'date':
            case 'datetime': {
                const d = toDate(value)
                if (!d) break
                return new Intl.DateTimeFormat(locale, {
                    dateStyle: 'medium',
                    ...(format === 'datetime' ? { timeStyle: 'short' } : {}),
                    timeZone,
                }).format(d)
            }
            case 'relative_date': {
                const d = toDate(value)
                if (!d) break
                const now = opts.now ?? new Date()
                const diffMs = d.getTime() - now.getTime()
                const abs = Math.abs(diffMs)
                const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
                if (abs < 3_600_000) return rtf.format(Math.round(diffMs / 60_000), 'minute')
                if (abs < 86_400_000) return rtf.format(Math.round(diffMs / 3_600_000), 'hour')
                return rtf.format(Math.round(diffMs / 86_400_000), 'day')
            }
        }
    } catch {
        /* invalid locale/currency: fall through to the raw value */
    }
    return displayValue(value)
}

export function StatsPanelView({ panel, record, metadata, locale, currency, timeZone }: PanelRendererProps) {
    const { t } = useTranslation()
    const items = panel.stats?.items ?? []
    const labelOf = (field: string, label?: string) =>
        label ? t(label) : metadata?.columns?.find((c) => c.key === field)?.label ?? field
    return (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="stats-panel">
            {items.map((it) => (
                <div key={it.field} className="rounded-md bg-muted/40 p-3">
                    <dt className="text-xs text-muted-foreground">{labelOf(it.field, it.label)}</dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                        {formatStat(record[it.field], it.format, { locale, currency, timeZone })}
                    </dd>
                </div>
            ))}
        </dl>
    )
}

export function RelationPanelView({ panel, record, metadata, data, onOpenRecord }: PanelRendererProps) {
    const { t } = useTranslation()
    const cfg = panel.relation
    const rel = metadata?.relations?.find((r) => r.name === cfg?.name)
    const limit = Math.min(Math.max(cfg?.limit ?? 10, 1), 50)
    const [rows, setRows] = React.useState<Record<string, unknown>[] | null>(null)
    const [total, setTotal] = React.useState<number | undefined>()
    const [error, setError] = React.useState(false)
    const recordId = record.id

    React.useEffect(() => {
        if (!rel || rel.kind !== 'one_to_many' || recordId === undefined || recordId === null) return
        let cancelled = false
        setRows(null)
        setError(false)
        data
            .list(rel.through, {
                ...buildRelationFilterParams(rel.foreign_key, String(recordId), rel.scope),
                per_page: limit,
            })
            .then(
                (res) => {
                    if (cancelled) return
                    setRows(res.rows)
                    setTotal(res.total)
                },
                () => !cancelled && setError(true),
            )
        return () => {
            cancelled = true
        }
    }, [data, rel, recordId, limit])

    if (!cfg) return null
    if (!rel || rel.kind !== 'one_to_many') {
        return <p className="text-xs text-muted-foreground">{cfg.name}</p>
    }
    if (error) {
        return (
            <p role="alert" className="text-sm text-destructive">
                {t('metacore.views.error', 'No se pudo cargar la información.')}
            </p>
        )
    }
    if (!rows) return <ViewSkeleton height={160} />
    if (rows.length === 0) {
        return <p className="py-4 text-sm text-muted-foreground">{t('metacore.views.empty', 'Sin datos todavía.')}</p>
    }
    const columns =
        cfg.columns && cfg.columns.length > 0
            ? cfg.columns
            : Object.keys(rows[0]).filter((k) => k !== 'id' && k !== rel.foreign_key && k !== 'organization_id').slice(0, 4)
    return (
        <div className="overflow-x-auto" data-testid="relation-panel">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                        {columns.map((c) => (
                            <th key={c} scope="col" className="px-2 py-1.5 font-medium">
                                {c}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr
                            key={String(row.id ?? i)}
                            className={['border-b last:border-0', onOpenRecord ? 'cursor-pointer hover:bg-muted/40' : ''].join(' ')}
                            onClick={onOpenRecord ? () => onOpenRecord(rel.through, row) : undefined}
                        >
                            {columns.map((c) => (
                                <td key={c} className="px-2 py-1.5">
                                    {displayValue(row[c])}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            {total !== undefined && total > rows.length ? (
                <p className="mt-2 text-xs text-muted-foreground">
                    {t('metacore.views.showing_of', '{{shown}} de {{total}}', { shown: rows.length, total })}
                </p>
            ) : null}
        </div>
    )
}
