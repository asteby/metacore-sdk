import { useId, useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Badge, Button, Progress, cn } from '@asteby/metacore-ui'
import { useDataloadUi, type DataloadUiProps } from './context'
import type { DataloadT } from './messages'
import type { DataloadPlan, DataloadRun, RowPlan } from './types'
import { ACTIONS, ACTION_TONE, DiffTable, RecordList, ReviewReasons, STATE_TONE, Stat, fieldCls, fmtDate } from './ui'
import { filterRows, progressPercent, summarizePlan, type RowFilter } from './utils'

/** The diff of one row: new record, per-field before/after, review reasons, or its issues. */
function RowCard({ r, t }: { r: RowPlan; t: DataloadT }) {
  const effective = r.action === 'review' ? r.outcome : r.action
  return (
    <li className='min-w-0 rounded-xl border bg-card p-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <Badge variant={ACTION_TONE[r.action]}>{t(`dataload.action.${r.action}`)}</Badge>
        {r.action === 'review' && r.outcome ? <Badge variant='outline'>{t(`dataload.outcome.${r.outcome}`)}</Badge> : null}
        <span className='text-xs text-muted-foreground tabular-nums'>{t('dataload.rows.row', { n: r.row })}</span>
        {r.key ? <span className='min-w-0 flex-1 break-all text-sm font-medium'>{r.key}</span> : null}
      </div>
      {r.review.length > 0 ? <div className='mt-2'><ReviewReasons items={r.review} t={t} /></div> : null}
      {effective === 'update' && r.diffs.length > 0 ? (
        <div className='mt-2'><DiffTable diffs={r.diffs} t={t} caption={t('dataload.rows.row', { n: r.row })} /></div>
      ) : null}
      {effective === 'create' && r.record ? <div className='mt-2'><RecordList record={r.record} t={t} /></div> : null}
      {r.issues.length > 0 ? (
        <ul className='m-0 mt-2 flex list-none flex-col gap-1 p-0 text-xs text-destructive' aria-label={t('dataload.issues')}>
          {r.issues.map((i, n) => (
            <li key={n} className='break-words'>{i.column ? `${i.column}: ` : ''}{i.message}</li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export interface PlanReviewProps extends DataloadUiProps {
  plan: DataloadPlan
  pageSize?: number
  className?: string
}

/** Summary tiles + filterable, paginated diff of a plan. Reusable on its own (e.g. for a past run). */
export function PlanReview({ plan, pageSize = 25, className, ...ui }: PlanReviewProps) {
  const { t } = useDataloadUi(ui)
  const sum = summarizePlan(plan)
  const [filter, setFilter] = useState<RowFilter>('changes')
  const [search, setSearch] = useState('')
  const [shown, setShown] = useState(pageSize)
  const searchId = useId()
  const rows = useMemo(() => filterRows(plan.rows, filter, search), [plan.rows, filter, search])
  const pick = (f: RowFilter) => {
    setFilter(f)
    setShown(pageSize)
  }
  const chips: { id: RowFilter; label: string }[] = [
    { id: 'changes', label: t('dataload.filter.changes') },
    { id: 'all', label: t('dataload.filter.all') },
    ...ACTIONS.filter((a) => sum[a] > 0).map((a) => ({ id: a as RowFilter, label: t(`dataload.action.${a}`) })),
  ]
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <dl className='m-0 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6'>
        {ACTIONS.map((a) => (
          <Stat key={a} label={t(`dataload.action.${a}`)} value={sum[a]} warn={a === 'invalid' && sum.invalid > 0} />
        ))}
      </dl>
      <p className='m-0 text-xs text-muted-foreground'>
        {t('dataload.summary.media', { n: sum.mediaUrls })} · {t('dataload.summary.ignored', { n: sum.ignoredColumns })}
      </p>
      {sum.review > 0 ? <p className='m-0 rounded-lg border bg-muted p-2.5 text-sm'>{t('dataload.summary.review', { n: sum.review })}</p> : null}
      <div className='flex flex-wrap gap-1.5' role='group' aria-label={t('dataload.filter.label')}>
        {chips.map((c) => (
          <Button key={c.id} size='sm' variant={filter === c.id ? 'default' : 'outline'} aria-pressed={filter === c.id} onClick={() => pick(c.id)}>
            {c.label}
          </Button>
        ))}
      </div>
      <div>
        <label htmlFor={searchId} className='sr-only'>{t('dataload.search')}</label>
        <input id={searchId} type='search' className={fieldCls} placeholder={t('dataload.search')} value={search} onChange={(e) => { setSearch(e.target.value); setShown(pageSize) }} />
      </div>
      {rows.length === 0 ? (
        <p className='m-0 text-sm text-muted-foreground'>{t('dataload.rows.empty')}</p>
      ) : (
        <ul className='m-0 flex list-none flex-col gap-2 p-0'>
          {rows.slice(0, shown).map((r) => (
            <RowCard key={r.row} r={r} t={t} />
          ))}
        </ul>
      )}
      {rows.length > shown ? (
        <Button variant='outline' size='sm' className='self-start' onClick={() => setShown((n) => n + pageSize)}>
          {t('dataload.rows.more', { n: rows.length - shown })}
        </Button>
      ) : null}
    </div>
  )
}

export interface RunProgressViewProps extends DataloadUiProps {
  run: DataloadRun
}

/** Progress bar + counters of a run (also usable for history entries). */
export function RunProgressView({ run, ...ui }: RunProgressViewProps) {
  const { t, locale } = useDataloadUi(ui)
  const p = run.progress
  const pct = progressPercent(p, run.state)
  const cells: [string, number][] = [
    [t('dataload.progress.created'), p.created],
    [t('dataload.progress.updated'), p.updated],
    [t('dataload.progress.unchanged'), p.unchanged],
    [t('dataload.progress.invalid'), p.invalid],
    [t('dataload.progress.media'), p.mediaQueued],
    ...(p.review ? [[t('dataload.progress.review'), p.review] as [string, number]] : []),
  ]
  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <Badge variant={STATE_TONE[run.state]}>{t(`dataload.state.${run.state}`)}</Badge>
        <span className='text-xs text-muted-foreground tabular-nums'>{t('dataload.progress.rows', { done: p.done, total: p.total })}</span>
        <span className='ml-auto text-xs text-muted-foreground'>{fmtDate(run.startedAt || run.createdAt, locale, t('dataload.empty_value'))}</span>
      </div>
      <Progress value={pct} aria-label={t('dataload.progress.label')} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} />
      <dl className='m-0 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6'>
        {cells.map(([label, n]) => (
          <Stat key={label} label={label} value={n} />
        ))}
      </dl>
      {run.replayOf ? <p className='m-0 text-sm text-muted-foreground'>{t('dataload.progress.replay')}</p> : null}
      {run.checkpoint?.resumes ? <p className='m-0 text-xs text-muted-foreground'>{t('dataload.progress.resumed', { n: run.checkpoint.resumes })}</p> : null}
      {run.error ? (
        <p role='alert' className='m-0 flex items-start gap-2 break-words text-sm text-destructive'>
          <AlertTriangle className='mt-0.5 size-4 shrink-0' aria-hidden />
          <span className='min-w-0'>{t('dataload.run.error', { message: run.error })}</span>
        </p>
      ) : null}
    </div>
  )
}
