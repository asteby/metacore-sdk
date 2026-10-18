import type { ReactNode } from 'react'
import { Badge, Card, CardContent, CardHeader, CardTitle, cn } from '@asteby/metacore-ui'
import type { DataloadT } from './messages'
import type { FieldDiff, PlanAction, ReviewItem, ReviewState, RunState } from './types'
import { formatValue, parseTime } from './utils'

export type Tone = 'success' | 'info' | 'muted' | 'danger' | 'warning' | 'outline'

export const ACTION_TONE: Record<PlanAction, Tone> = {
  create: 'success',
  update: 'info',
  unchanged: 'muted',
  invalid: 'danger',
  duplicate: 'warning',
  review: 'warning',
}
export const STATE_TONE: Record<RunState, Tone> = {
  queued: 'muted',
  running: 'info',
  succeeded: 'success',
  failed: 'danger',
  canceled: 'warning',
}
export const REVIEW_TONE: Record<ReviewState, Tone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  applied: 'info',
  superseded: 'muted',
}
export const ACTIONS: PlanAction[] = ['create', 'update', 'unchanged', 'review', 'invalid', 'duplicate']

/** Native fields share the host's input look, with a visible focus ring. */
export const fieldCls =
  'h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'
export const areaCls = cn(fieldCls, 'h-auto min-h-16 py-2')
export const checkCls = 'mt-0.5 size-4 shrink-0 accent-[var(--primary)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

export function fmtDate(iso: string | undefined, locale: string, empty = '—') {
  const d = parseTime(iso)
  return d ? d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : empty
}

export function Step({ n, title, children, className }: { n?: number; title: string; children: ReactNode; className?: string }) {
  return (
    <Card className={cn('py-4', className)}>
      <CardHeader className='px-4'>
        <CardTitle className='flex items-center gap-2 text-base'>
          {n ? (
            <span className='grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary tabular-nums' aria-hidden>{n}</span>
          ) : null}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-3 px-4'>{children}</CardContent>
    </Card>
  )
}

/** Stat tile (inside a `<dl>`). */
export function Stat({ label, value, warn }: { label: string; value: ReactNode; warn?: boolean }) {
  return (
    <div className='min-w-0 rounded-lg border bg-background p-2.5'>
      <dt className='truncate text-xs text-muted-foreground'>{label}</dt>
      <dd className={cn('m-0 mt-0.5 text-lg font-semibold tabular-nums', warn && 'text-destructive')}>{value}</dd>
    </div>
  )
}

/** Field-level before/after. A table with headers, so screen readers announce each column. */
export function DiffTable({ diffs, t, caption }: { diffs: FieldDiff[]; t: DataloadT; caption?: string }) {
  if (diffs.length === 0) return <p className='m-0 text-xs text-muted-foreground'>{t('dataload.diff.none')}</p>
  const empty = t('dataload.empty_value')
  return (
    <div className='max-w-full overflow-x-auto'>
      <table className='w-full min-w-[18rem] border-collapse text-xs'>
        {caption ? <caption className='sr-only'>{caption}</caption> : null}
        <thead>
          <tr className='text-left text-muted-foreground'>
            <th scope='col' className='py-1 pr-2 font-medium'>{t('dataload.diff.field')}</th>
            <th scope='col' className='py-1 pr-2 font-medium'>{t('dataload.diff.old')}</th>
            <th scope='col' className='py-1 font-medium'>{t('dataload.diff.new')}</th>
          </tr>
        </thead>
        <tbody>
          {diffs.map((d) => (
            <tr key={d.field} className='border-t align-top'>
              <th scope='row' className='py-1 pr-2 text-left font-medium break-all'>{d.field}</th>
              <td className='py-1 pr-2'>
                <span className='block break-words rounded-md bg-destructive/10 px-2 py-1 text-destructive line-through decoration-destructive/40'>{formatValue(d.old, 120, empty)}</span>
              </td>
              <td className='py-1'>
                <span className='block break-words rounded-md bg-[color-mix(in_oklab,var(--success,oklch(0.6_0.15_155))_14%,transparent)] px-2 py-1'>{formatValue(d.new, 120, empty)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Record fields as a description list (new rows, rows held for review). */
export function RecordList({ record, t, max = 8 }: { record: Record<string, unknown>; t: DataloadT; max?: number }) {
  const empty = t('dataload.empty_value')
  return (
    <dl className='m-0 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2'>
      {Object.entries(record).slice(0, max).map(([k, v]) => (
        <div key={k} className='flex min-w-0 gap-2'>
          <dt className='shrink-0 text-muted-foreground'>{k}</dt>
          <dd className='m-0 min-w-0 break-words'>{formatValue(v, 80, empty)}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Review reasons: severity badge + code (+ field and detail, which come from the extract document). */
export function ReviewReasons({ items, t }: { items: ReviewItem[]; t: DataloadT }) {
  if (items.length === 0) return null
  return (
    <ul className='m-0 flex list-none flex-col gap-1 p-0 text-xs'>
      {items.map((i, n) => (
        <li key={`${i.code}-${n}`} className='flex min-w-0 flex-wrap items-center gap-1.5'>
          <Badge variant={i.severity === 'revisar' ? 'warning' : 'muted'}>{t(`dataload.severity.${i.severity}`)}</Badge>
          <code className='break-all font-mono'>{i.code}</code>
          {i.field ? <span className='text-muted-foreground'>· {i.field}</span> : null}
          {i.detail ? <span className='min-w-0 break-words'>{i.detail}</span> : null}
        </li>
      ))}
    </ul>
  )
}
