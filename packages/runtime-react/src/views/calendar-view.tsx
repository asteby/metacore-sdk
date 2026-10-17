// `view_type: calendar`: a model's rows on a month grid. Lazy chunk, no
// calendar library: a 7-column CSS grid built from the UI kit, one request per
// visible month (`f_<start_field>=RANGE:<first>,<last>`, the list syntax the
// kernel already serves). Multi-day entries (end_field) show on each day.
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge, Button } from '@asteby/metacore-ui/primitives'
import type { CalendarView } from '@asteby/metacore-sdk'
import type { ViewRendererProps } from './types'
import { dayKey, displayValue, toDate } from './data-source'
import { ViewSkeleton } from './skeleton'

const MAX_ROWS = 500

export interface CalendarEntry {
    key: string
    title: string
    start: Date
    end: Date
    allDay: boolean
    color?: string
    row: Record<string, unknown>
}

/** First and last calendar day of the month containing `d` (`YYYY-MM-DD`). */
export function monthRange(d: Date): { first: string; last: string } {
    const first = new Date(d.getFullYear(), d.getMonth(), 1, 12)
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12)
    return { first: dayKey(first), last: dayKey(last) }
}

/** Pure: rows → entries with parsed dates (rows without a start are dropped). */
export function toCalendarEntries(rows: Record<string, unknown>[], view: CalendarView): CalendarEntry[] {
    const out: CalendarEntry[] = []
    rows.forEach((row, i) => {
        const start = toDate(row[view.start_field])
        if (!start) return
        const endRaw = view.end_field ? toDate(row[view.end_field]) : null
        const end = endRaw && endRaw.getTime() >= start.getTime() ? endRaw : start
        const allDayRaw = view.all_day_field ? row[view.all_day_field] : undefined
        const allDay =
            allDayRaw !== undefined
                ? allDayRaw === true || allDayRaw === 'true'
                : typeof row[view.start_field] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row[view.start_field] as string)
        out.push({
            key: String(row.id ?? i),
            title: displayValue(view.title_field ? row[view.title_field] : row.name ?? row.title ?? row.id),
            start,
            end,
            allDay,
            color: view.color_by ? displayValue(row[view.color_by]) || undefined : undefined,
            row,
        })
    })
    return out
}

/** Pure: entries bucketed by local day key, each multi-day entry on every day it spans. */
export function bucketByDay(entries: CalendarEntry[], maxSpanDays = 62): Map<string, CalendarEntry[]> {
    const map = new Map<string, CalendarEntry[]>()
    for (const e of entries) {
        const cur = new Date(e.start.getFullYear(), e.start.getMonth(), e.start.getDate(), 12)
        const stop = new Date(e.end.getFullYear(), e.end.getMonth(), e.end.getDate(), 12)
        for (let n = 0; cur.getTime() <= stop.getTime() && n < maxSpanDays; n++) {
            const k = dayKey(cur)
            const arr = map.get(k) ?? []
            arr.push(e)
            map.set(k, arr)
            cur.setDate(cur.getDate() + 1)
        }
    }
    return map
}

function weeksOf(month: Date): Date[][] {
    const first = new Date(month.getFullYear(), month.getMonth(), 1, 12)
    // Monday-first grid (es-MX convention); pad with the previous month.
    const offset = (first.getDay() + 6) % 7
    const start = new Date(first)
    start.setDate(first.getDate() - offset)
    const weeks: Date[][] = []
    const cur = new Date(start)
    do {
        const week: Date[] = []
        for (let i = 0; i < 7; i++) {
            week.push(new Date(cur))
            cur.setDate(cur.getDate() + 1)
        }
        weeks.push(week)
    } while (cur.getMonth() === month.getMonth())
    return weeks
}

export default function CalendarViewRenderer(props: ViewRendererProps<'calendar'>) {
    const { model, view, data, locale, onOpenRecord, className } = props
    const { t } = useTranslation()
    const [month, setMonth] = React.useState(() => {
        const n = new Date()
        return new Date(n.getFullYear(), n.getMonth(), 1, 12)
    })
    const [rows, setRows] = React.useState<Record<string, unknown>[] | null>(null)
    const [error, setError] = React.useState(false)
    const { first, last } = monthRange(month)

    React.useEffect(() => {
        let cancelled = false
        setRows(null)
        setError(false)
        data
            .list(model, {
                [`f_${view.start_field}`]: `RANGE:${first},${last}`,
                per_page: MAX_ROWS,
                sortBy: view.start_field,
                order: 'asc',
            })
            .then((res) => !cancelled && setRows(res.rows))
            .catch(() => !cancelled && setError(true))
        return () => {
            cancelled = true
        }
    }, [data, model, view.start_field, first, last])

    const monthLabel = React.useMemo(() => {
        try {
            return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(month)
        } catch {
            return dayKey(month).slice(0, 7)
        }
    }, [locale, month])
    const weekdayLabels = React.useMemo(() => {
        const monday = new Date(2024, 0, 1, 12) // a Monday
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(monday)
            d.setDate(monday.getDate() + i)
            try {
                return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d)
            } catch {
                return String(i)
            }
        })
    }, [locale])

    const byDay = React.useMemo(
        () => bucketByDay(toCalendarEntries(rows ?? [], view)),
        [rows, view],
    )
    const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1, 12))
    const today = dayKey(new Date())

    return (
        <div className={className} data-testid="calendar-view">
            <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold capitalize text-foreground" aria-live="polite">
                    {monthLabel}
                </h2>
                <div className="flex gap-1">
                    <Button variant="outline" size="icon" aria-label={t('metacore.views.prev_month', 'Mes anterior')} onClick={() => shift(-1)}>
                        <ChevronLeft aria-hidden className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" aria-label={t('metacore.views.next_month', 'Mes siguiente')} onClick={() => shift(1)}>
                        <ChevronRight aria-hidden className="h-4 w-4" />
                    </Button>
                </div>
            </div>
            {error ? (
                <p role="alert" className="text-sm text-destructive">
                    {t('metacore.views.error', 'No se pudo cargar la información.')}
                </p>
            ) : !rows ? (
                <ViewSkeleton height={480} />
            ) : (
                <div role="grid" aria-label={monthLabel} className="overflow-hidden rounded-lg border">
                    <div role="row" className="grid grid-cols-7 border-b bg-muted/40">
                        {weekdayLabels.map((w) => (
                            <div key={w} role="columnheader" className="px-2 py-1 text-xs font-medium text-muted-foreground">
                                {w}
                            </div>
                        ))}
                    </div>
                    {weeksOf(month).map((week) => (
                        <div key={dayKey(week[0])} role="row" className="grid grid-cols-7">
                            {week.map((d) => {
                                const k = dayKey(d)
                                const items = byDay.get(k) ?? []
                                const outside = d.getMonth() !== month.getMonth()
                                return (
                                    <div
                                        key={k}
                                        role="gridcell"
                                        aria-label={k}
                                        data-day={k}
                                        className={[
                                            'min-h-[6rem] border-b border-r p-1 text-xs',
                                            outside ? 'bg-muted/20 text-muted-foreground' : '',
                                        ].join(' ')}
                                    >
                                        <div className={['mb-1 text-right', k === today ? 'font-semibold text-primary' : ''].join(' ')}>
                                            {d.getDate()}
                                        </div>
                                        <ul className="space-y-1">
                                            {items.slice(0, 3).map((e) => (
                                                <li key={e.key}>
                                                    <button
                                                        type="button"
                                                        className="w-full truncate rounded px-1 py-0.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                        onClick={() => onOpenRecord?.(e.row)}
                                                        title={e.title}
                                                    >
                                                        {e.color ? (
                                                            <Badge variant="outline" className="mr-1 px-1 py-0 text-[10px]">
                                                                {e.color}
                                                            </Badge>
                                                        ) : null}
                                                        {e.title}
                                                    </button>
                                                </li>
                                            ))}
                                            {items.length > 3 ? (
                                                <li className="px-1 text-muted-foreground">
                                                    {t('metacore.views.more_count', '+{{count}} más', { count: items.length - 3 })}
                                                </li>
                                            ) : null}
                                        </ul>
                                    </div>
                                )
                            })}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
