import { useId, useMemo, useState, type ChangeEvent } from 'react'
import { AlertTriangle, FileUp, Play, RotateCcw, Square } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Progress, cn } from '@asteby/metacore-ui'
import { apiErrorMessage, type DataloadApi } from './api'
import { useDataloadActions, useDataloadProfiles, useDataloadRuns, useDataloadLauncher } from './hooks'
import { makeT, type DataloadT } from './messages'
import { MediaBackupPanel } from './media-backup-panel'
import type { DataloadOverrides, DataloadPlan, DataloadRun, PlanAction, RowPlan, RunState, TranslateFn } from './types'
import {
  DEFAULT_MAX_FILE_BYTES,
  SourceFileError,
  canApply,
  filterRows,
  formatBytes,
  formatValue,
  parseTime,
  progressPercent,
  readSourceFile,
  summarizePlan,
  type RowFilter,
} from './utils'

export interface DataloadLauncherProps {
  api: DataloadApi
  t?: TranslateFn
  notify?: { success(msg: string): void; error(msg: string): void }
  locale?: string
  /** Per-organization overrides sent with every dry-run / run. */
  overrides?: DataloadOverrides
  /** Preselect a registered profile by name. */
  defaultProfile?: string
  maxFileBytes?: number
  /** Rows shown per page in the diff list. */
  pageSize?: number
  /** Show the media-backup panel and the history. Both default to true. */
  showMedia?: boolean
  showHistory?: boolean
  onFinished?: (run: DataloadRun) => void
  className?: string
}

const ACTION_TONE: Record<PlanAction, 'success' | 'info' | 'muted' | 'danger' | 'warning'> = {
  create: 'success',
  update: 'info',
  unchanged: 'muted',
  invalid: 'danger',
  duplicate: 'warning',
}
const STATE_TONE: Record<RunState, 'muted' | 'info' | 'success' | 'danger' | 'warning'> = {
  queued: 'muted',
  running: 'info',
  succeeded: 'success',
  failed: 'danger',
  canceled: 'warning',
}
const ACTIONS: PlanAction[] = ['create', 'update', 'unchanged', 'invalid', 'duplicate']

function fmtDate(iso: string | undefined, locale: string) {
  const d = parseTime(iso)
  return d ? d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <Card className='py-4'>
      <CardHeader className='px-4'>
        <CardTitle className='flex items-center gap-2 text-base'>
          <span className='grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary tabular-nums' aria-hidden>{n}</span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-3 px-4'>{children}</CardContent>
    </Card>
  )
}

const fieldCls =
  'h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50'

/** The diff of one row: new record, per-field before/after, or its issues. */
function RowCard({ r, t }: { r: RowPlan; t: DataloadT }) {
  return (
    <li className='min-w-0 rounded-xl border bg-card p-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <Badge variant={ACTION_TONE[r.action]}>{t(`dataload.action.${r.action}` as never)}</Badge>
        <span className='text-xs text-muted-foreground tabular-nums'>{t('dataload.rows.row', { n: r.row })}</span>
        {r.key ? <span className='min-w-0 flex-1 break-all text-sm font-medium'>{r.key}</span> : null}
      </div>
      {r.action === 'update' && r.diffs.length > 0 ? (
        <ul className='m-0 mt-2 flex list-none flex-col gap-2 p-0'>
          {r.diffs.map((d) => (
            <li key={d.field} className='min-w-0 text-xs'>
              <span className='font-medium'>{d.field}</span>
              <div className='mt-0.5 grid grid-cols-1 gap-1 sm:grid-cols-2'>
                <span className='min-w-0 break-words rounded-md bg-destructive/10 px-2 py-1 text-destructive line-through decoration-destructive/40'>
                  <span className='sr-only'>{t('dataload.diff.old')}: </span>{formatValue(d.old)}
                </span>
                <span className='min-w-0 break-words rounded-md bg-[color-mix(in_oklab,var(--success,oklch(0.6_0.15_155))_14%,transparent)] px-2 py-1'>
                  <span className='sr-only'>{t('dataload.diff.new')}: </span>{formatValue(d.new)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {r.action === 'create' && r.record ? (
        <dl className='m-0 mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2'>
          {Object.entries(r.record).slice(0, 8).map(([k, v]) => (
            <div key={k} className='flex min-w-0 gap-2'>
              <dt className='shrink-0 text-muted-foreground'>{k}</dt>
              <dd className='m-0 min-w-0 break-words'>{formatValue(v, 80)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {r.issues.length > 0 ? (
        <ul className='m-0 mt-2 flex list-none flex-col gap-1 p-0 text-xs text-destructive'>
          {r.issues.map((i, n) => (
            <li key={n} className='break-words'>{i.column ? `${i.column}: ` : ''}{i.message}</li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/** Summary tiles + filterable, paginated diff of a plan. Reusable on its own (e.g. for a past run). */
export function PlanReview({ plan, t: tIn, pageSize = 25, className }: { plan: DataloadPlan; t?: TranslateFn; pageSize?: number; className?: string }) {
  const t = useMemo(() => makeT(tIn), [tIn])
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
    ...ACTIONS.filter((a) => (sum[a === 'duplicate' ? 'duplicate' : a] ?? 0) > 0).map((a) => ({ id: a as RowFilter, label: t(`dataload.action.${a}` as never) })),
  ]
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <dl className='m-0 grid grid-cols-2 gap-2 sm:grid-cols-5'>
        {ACTIONS.map((a) => (
          <div key={a} className='min-w-0 rounded-lg border bg-background p-2.5'>
            <dt className='truncate text-xs text-muted-foreground'>{t(`dataload.action.${a}` as never)}</dt>
            <dd className={cn('m-0 mt-0.5 text-lg font-semibold tabular-nums', a === 'invalid' && sum.invalid > 0 && 'text-destructive')}>{sum[a]}</dd>
          </div>
        ))}
      </dl>
      <p className='m-0 text-xs text-muted-foreground'>
        {t('dataload.summary.media', { n: sum.mediaUrls })} · {t('dataload.summary.ignored', { n: sum.ignoredColumns })}
      </p>
      <div className='flex flex-wrap gap-1.5' role='group' aria-label={t('dataload.step.review')}>
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

/** Progress bar + counters of a run (also usable for history entries). */
export function RunProgressView({ run, t: tIn, locale = 'es-MX' }: { run: DataloadRun; t?: TranslateFn; locale?: string }) {
  const t = useMemo(() => makeT(tIn), [tIn])
  const p = run.progress
  const pct = progressPercent(p, run.state)
  const cells: [string, number][] = [
    [t('dataload.progress.created'), p.created],
    [t('dataload.progress.updated'), p.updated],
    [t('dataload.progress.unchanged'), p.unchanged],
    [t('dataload.progress.invalid'), p.invalid],
    [t('dataload.progress.media'), p.mediaQueued],
  ]
  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <Badge variant={STATE_TONE[run.state]}>{t(`dataload.state.${run.state}` as never)}</Badge>
        <span className='text-xs text-muted-foreground tabular-nums'>{t('dataload.progress.rows', { done: p.done, total: p.total })}</span>
        <span className='ml-auto text-xs text-muted-foreground'>{fmtDate(run.startedAt || run.createdAt, locale)}</span>
      </div>
      <Progress value={pct} aria-label={t('dataload.progress.label')} aria-valuenow={pct} />
      <dl className='m-0 grid grid-cols-2 gap-2 sm:grid-cols-5'>
        {cells.map(([label, n]) => (
          <div key={label} className='min-w-0 rounded-lg border bg-background p-2.5'>
            <dt className='truncate text-xs text-muted-foreground'>{label}</dt>
            <dd className='m-0 mt-0.5 text-lg font-semibold tabular-nums'>{n}</dd>
          </div>
        ))}
      </dl>
      {run.replayOf ? <p className='m-0 text-sm text-muted-foreground'>{t('dataload.progress.replay')}</p> : null}
      {run.error ? (
        <p role='alert' className='m-0 flex items-start gap-2 break-words text-sm text-destructive'>
          <AlertTriangle className='mt-0.5 size-4 shrink-0' aria-hidden />
          <span className='min-w-0'>{t('dataload.run.error')}: {run.error}</span>
        </p>
      ) : null}
    </div>
  )
}

function History({ api, t, locale }: { api: DataloadApi; t: DataloadT; locale: string }) {
  const runs = useDataloadRuns(api, 10)
  return (
    <Card className='py-4'>
      <CardHeader className='px-4'>
        <CardTitle className='text-base'>{t('dataload.history')}</CardTitle>
      </CardHeader>
      <CardContent className='px-4'>
        {runs.isError ? (
          <p role='alert' className='m-0 text-sm'>{t('dataload.history.load_error')}</p>
        ) : (runs.data ?? []).length === 0 ? (
          <p className='m-0 text-sm text-muted-foreground'>{runs.isLoading ? t('dataload.loading') : t('dataload.history.empty')}</p>
        ) : (
          <ul className='m-0 flex list-none flex-col gap-2 p-0'>
            {(runs.data ?? []).map((r) => (
              <li key={r.id} className='flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-3 text-sm'>
                <span className='flex flex-wrap items-center gap-2'>
                  <Badge variant={STATE_TONE[r.state]}>{t(`dataload.state.${r.state}` as never)}</Badge>
                  <Badge variant='outline'>{t(`dataload.mode.${r.mode}` as never)}</Badge>
                  {r.replayOf ? <Badge variant='muted'>{t('dataload.history.replay')}</Badge> : null}
                  <span className='min-w-0 flex-1 truncate font-medium'>{r.profile}</span>
                </span>
                <span className='break-all text-xs text-muted-foreground'>{r.source}</span>
                <span className='flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums'>
                  <span>{fmtDate(r.createdAt, locale)}</span>
                  <span>+{r.progress.created} / ~{r.progress.updated} / ={r.progress.unchanged} / !{r.progress.invalid}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Launch a bulk load: choose a registered profile and a CSV/JSON file, review the
 * dry-run and its diff, apply, follow the progress, and check the media backup.
 * Uses the host's design tokens, so light/dark themes apply; single column on phones.
 */
export function DataloadLauncher({
  api,
  t: tIn,
  notify,
  locale = 'es-MX',
  overrides,
  defaultProfile,
  maxFileBytes = DEFAULT_MAX_FILE_BYTES,
  pageSize,
  showMedia = true,
  showHistory = true,
  onFinished,
  className,
}: DataloadLauncherProps) {
  const t = useMemo(() => makeT(tIn), [tIn])
  const profiles = useDataloadProfiles(api)
  const launcher = useDataloadLauncher(api, { overrides, onFinished })
  const actions = useDataloadActions(api)
  const [bundlePath, setBundlePath] = useState('')
  const [file, setFile] = useState<File | undefined>()
  const [fileError, setFileError] = useState<string | undefined>()
  const profileId = useId()
  const fileId = useId()
  const pathId = useId()
  const { phase, plan, run } = launcher
  const names = (profiles.data ?? []).map((p) => p.profile.name)
  const profile = launcher.profile || (defaultProfile && names.includes(defaultProfile) ? defaultProfile : '')
  const isJson = !!file && file.name.toLowerCase().endsWith('.json')

  const load = async (f: File | undefined, path = bundlePath) => {
    setFile(f)
    setFileError(undefined)
    if (!f) return launcher.setSource(undefined)
    try {
      launcher.setSource(await readSourceFile(f, { maxBytes: maxFileBytes, bundlePath: path }))
    } catch (e) {
      launcher.setSource(undefined)
      setFileError(t(`dataload.file.${e instanceof SourceFileError ? e.code : 'unsupported'}` as never))
    }
  }
  const onFile = (e: ChangeEvent<HTMLInputElement>) => void load(e.target.files?.[0])
  const onPath = (v: string) => {
    setBundlePath(v)
    if (file) void load(file, v)
  }
  // Keep the hook's profile in sync with the default (first render only).
  if (profile && !launcher.profile) launcher.setProfile(profile)

  const guard = async (fn: () => Promise<unknown>, fallback: string, ok?: string) => {
    try {
      await fn()
      if (ok) notify?.success(ok)
    } catch (e) {
      notify?.error(apiErrorMessage(e, fallback))
    }
  }

  const inFlight = phase === 'running' || phase === 'starting'
  const showProgress = !!run && (phase === 'running' || phase === 'finished')

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className='min-w-0'>
        <h1 className='m-0 text-xl font-semibold tracking-tight'>{t('dataload.title')}</h1>
        <p className='m-0 mt-1 max-w-2xl text-sm text-muted-foreground'>{t('dataload.subtitle')}</p>
      </div>

      <Step n={1} title={t('dataload.step.source')}>
        <div className='flex flex-col gap-1.5'>
          <label htmlFor={profileId} className='text-sm font-medium'>{t('dataload.profile')}</label>
          <select id={profileId} className={fieldCls} value={profile} disabled={launcher.locked || profiles.isLoading} onChange={(e) => launcher.setProfile(e.target.value)}>
            <option value=''>{t('dataload.profile.choose')}</option>
            {(profiles.data ?? []).map((p) => (
              <option key={p.profile.name} value={p.profile.name}>{p.profile.name} · v{p.profile.version}</option>
            ))}
          </select>
          {profiles.isSuccess && names.length === 0 ? <p className='m-0 text-xs text-muted-foreground'>{t('dataload.profile.none')}</p> : null}
        </div>
        <div className='flex flex-col gap-1.5'>
          <label htmlFor={fileId} className='text-sm font-medium'>{t('dataload.file')}</label>
          <input id={fileId} type='file' accept='.csv,.tsv,.txt,.json,text/csv,application/json' className={cn(fieldCls, 'h-auto py-1.5 file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-secondary-foreground')} disabled={launcher.locked} onChange={onFile} aria-describedby={`${fileId}-hint`} />
          <p id={`${fileId}-hint`} className='m-0 text-xs text-muted-foreground'>{t('dataload.file.hint', { max: formatBytes(maxFileBytes) })}</p>
          {fileError ? <p role='alert' className='m-0 text-sm text-destructive'>{fileError}</p> : null}
          {launcher.source ? <p className='m-0 break-all text-xs'>{t('dataload.file.selected', { name: launcher.source.name })}</p> : null}
        </div>
        {isJson ? (
          <div className='flex flex-col gap-1.5'>
            <label htmlFor={pathId} className='text-sm font-medium'>{t('dataload.bundle_path')}</label>
            <input id={pathId} className={fieldCls} value={bundlePath} disabled={launcher.locked} onChange={(e) => onPath(e.target.value)} aria-describedby={`${pathId}-hint`} />
            <p id={`${pathId}-hint`} className='m-0 text-xs text-muted-foreground'>{t('dataload.bundle_path.hint')}</p>
          </div>
        ) : null}
        <div className='flex flex-wrap gap-2'>
          <Button
            disabled={!launcher.ready || launcher.locked || phase === 'planning'}
            onClick={() => guard(() => launcher.dryRun(), t('dataload.dry_run.error'))}
          >
            <FileUp className='size-4' aria-hidden />
            {phase === 'planning' ? t('dataload.dry_running') : t('dataload.dry_run')}
          </Button>
          {phase !== 'idle' ? (
            <Button variant='ghost' disabled={inFlight} onClick={() => { launcher.reset(); setFile(undefined); setBundlePath('') }}>
              <RotateCcw className='size-4' aria-hidden />
              {t('dataload.reset')}
            </Button>
          ) : null}
        </div>
        {launcher.error && phase !== 'planning' ? (
          <p role='alert' className='m-0 break-words text-sm text-destructive'>{apiErrorMessage(launcher.error, t('dataload.dry_run.error'))}</p>
        ) : null}
      </Step>

      {plan ? (
        <Step n={2} title={t('dataload.step.review')}>
          {launcher.previewRun?.replayOf ? <p className='m-0 rounded-lg border bg-muted p-2.5 text-sm'>{t('dataload.summary.replay')}</p> : null}
          <PlanReview plan={plan} t={tIn} pageSize={pageSize} />
          {phase === 'planned' || phase === 'starting' ? (
            <div className='flex flex-col gap-2 border-t pt-3'>
              <label className='flex items-start gap-2 text-sm'>
                <input type='checkbox' className='mt-0.5 size-4 accent-[var(--primary)]' checked={launcher.failOnInvalid} onChange={(e) => launcher.setFailOnInvalid(e.target.checked)} />
                {t('dataload.fail_on_invalid')}
              </label>
              <label className='flex items-start gap-2 text-sm'>
                <input type='checkbox' className='mt-0.5 size-4 accent-[var(--primary)]' checked={launcher.force} onChange={(e) => launcher.setForce(e.target.checked)} />
                {t('dataload.force')}
              </label>
              {!canApply(plan) ? <p className='m-0 text-sm text-muted-foreground'>{t('dataload.nothing_to_apply')}</p> : null}
              <Button
                className='self-start'
                disabled={!canApply(plan) || phase === 'starting'}
                onClick={() => guard(() => launcher.execute(), t('dataload.apply.error'), t('dataload.apply.started'))}
              >
                <Play className='size-4' aria-hidden />
                {phase === 'starting' ? t('dataload.applying') : t('dataload.apply')}
              </Button>
            </div>
          ) : null}
        </Step>
      ) : null}

      {showProgress && run ? (
        <Step n={3} title={t('dataload.step.progress')}>
          <div aria-live='polite'>
            <RunProgressView run={run} t={tIn} locale={locale} />
          </div>
          {phase === 'running' ? (
            <Button variant='outline' className='self-start' disabled={actions.cancel.isPending} onClick={() => guard(() => actions.cancel.mutateAsync(run.id), t('dataload.cancel.error'))}>
              <Square className='size-4' aria-hidden />
              {t('dataload.cancel')}
            </Button>
          ) : null}
        </Step>
      ) : null}

      {showMedia ? <MediaBackupPanel api={api} t={tIn} notify={notify} watch={inFlight || phase === 'finished'} /> : null}
      {showHistory ? <History api={api} t={t} locale={locale} /> : null}
    </div>
  )
}
