import { useId, useState, type ChangeEvent } from 'react'
import { FileUp, Play, RefreshCw, RotateCcw, Square, X } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Progress, cn } from '@asteby/metacore-ui'
import { apiErrorMessage, profileRef, type DataloadApi } from './api'
import { useDataloadUi, type DataloadUiProps } from './context'
import {
  useDataloadActions,
  useDataloadProfiles,
  useDataloadRuns,
  useDataloadLauncher,
  useResolvedVersion,
  useSourceFile,
  type SourceFileOptions,
} from './hooks'
import type { DataloadT } from './messages'
import { MediaBackupPanel } from './media-backup-panel'
import { OverridesEditor } from './overrides-editor'
import { PlanReview, RunProgressView } from './plan-review'
import { ReviewQueue } from './review-queue'
import type { DataloadOverrides, DataloadRun, DataloadSourceInput } from './types'
import { STATE_TONE, Step, checkCls, fieldCls, fmtDate } from './ui'
import { canApply, formatBytes } from './utils'

export interface DataloadLauncherProps extends DataloadUiProps {
  api: DataloadApi
  /** Per-organization overrides sent with every dry-run / run (initial value when the editor is shown). */
  overrides?: DataloadOverrides
  /** Preselect a registered profile: `name@version`, `base/name@version`, or just a name (its newest version of the organization, else of the base). */
  defaultProfile?: string
  /** Inline limit: bigger files are uploaded in parts (see `chunkedUpload`). Default 25 MB. */
  maxFileBytes?: number
  /** Upload files above `maxFileBytes` in parts. `false` keeps the inline limit as a hard cap. Default true. */
  chunkedUpload?: boolean | Omit<SourceFileOptions, 'inlineMaxBytes' | 'chunked'>
  /** Rows shown per page in the diff list. */
  pageSize?: number
  /** Show the media-backup panel, the history, the review queue and the overrides editor. All default to true. */
  showMedia?: boolean
  showHistory?: boolean
  showReviews?: boolean
  showOverrides?: boolean
  onFinished?: (run: DataloadRun) => void
  className?: string
}

function History({ api, t, locale }: { api: DataloadApi; t: DataloadT; locale: string }) {
  const runs = useDataloadRuns(api, 10)
  return (
    <Card className='py-4'>
      <CardHeader className='px-4'>
        <CardTitle className='text-base'><h2 className='m-0 text-base font-semibold'>{t('dataload.history')}</h2></CardTitle>
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
                  <Badge variant={STATE_TONE[r.state]}>{t(`dataload.state.${r.state}`)}</Badge>
                  <Badge variant='outline'>{t(`dataload.mode.${r.mode}`)}</Badge>
                  {r.replayOf ? <Badge variant='muted'>{t('dataload.history.replay')}</Badge> : null}
                  <span className='min-w-0 flex-1 truncate font-medium'>{r.profile}</span>
                </span>
                <span className='break-all text-xs text-muted-foreground'>{r.source}</span>
                <span className='flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums'>
                  <span>{fmtDate(r.createdAt, locale, t('dataload.empty_value'))}</span>
                  <span>{t('dataload.history.counts', { created: r.progress.created, updated: r.progress.updated, unchanged: r.progress.unchanged, invalid: r.progress.invalid })}</span>
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
 * Launch a bulk load: choose a registered profile and a CSV/JSON file (big files
 * are uploaded in parts), adjust the organization's overrides, review the dry-run
 * and its diff, apply, follow the progress, decide the rows held for review and
 * check the media backup. Uses the host's design tokens, so light/dark themes
 * apply; single column on phones. Controls follow `capabilities`.
 */
export function DataloadLauncher({
  api,
  overrides,
  defaultProfile,
  maxFileBytes,
  chunkedUpload = true,
  pageSize,
  showMedia = true,
  showHistory = true,
  showReviews = true,
  showOverrides = true,
  onFinished,
  className,
  ...uiProps
}: DataloadLauncherProps) {
  const ui = useDataloadUi(uiProps)
  const { t, locale, caps, notify, i18n } = ui
  const profiles = useDataloadProfiles(api)
  const launcher = useDataloadLauncher(api, { overrides, onFinished })
  const actions = useDataloadActions(api)
  const file = useSourceFile(api, {
    inlineMaxBytes: maxFileBytes,
    chunked: chunkedUpload !== false,
    ...(typeof chunkedUpload === 'object' ? chunkedUpload : {}),
  })
  const [bundlePath, setBundlePath] = useState('')
  const [fileName, setFileName] = useState<string | undefined>()
  const [fileKey, setFileKey] = useState(0)
  const profileId = useId()
  const fileId = useId()
  const pathId = useId()
  const uploadId = useId()
  const { phase, plan, run } = launcher
  const list = profiles.data ?? []
  const names = list.map(profileRef)
  const byDefault = defaultProfile
    ? names.includes(defaultProfile)
      ? defaultProfile
      : (() => {
          const own = list.filter((p) => p.name === defaultProfile && !p.shared)
          const pick = own.length ? own : list.filter((p) => p.name === defaultProfile)
          const last = [...pick].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).pop()
          return last ? profileRef(last) : ''
        })()
    : ''
  const profile = launcher.profile || byDefault
  const stored = list.find((p) => profileRef(p) === profile)
  const resolved = useResolvedVersion(api, stored)
  const suggestVersion = (() => {
    if (!stored) return ''
    const taken = new Set(list.filter((p) => p.name === stored.name && !p.shared).map((p) => p.version))
    const base = resolved.data?.baseKey.version ?? stored.version
    for (let n = 1; ; n++) if (!taken.has(`${base}-org.${n}`)) return `${base}-org.${n}`
  })()
  const isJson = !!fileName && fileName.toLowerCase().endsWith('.json')

  // The rows path only changes how the server reads the JSON: patch the source, never re-read or re-upload.
  const withPath = (src: DataloadSourceInput, path: string): DataloadSourceInput => {
    if (src.format === 'csv') return src
    const p = path.trim()
    const { path: _old, ...rest } = src
    return p ? { ...rest, format: 'bundle', path: p } : { ...rest, format: 'json' }
  }
  const load = async (f: File | undefined) => {
    setFileName(f?.name)
    launcher.setSource(undefined)
    const s = await file.pick(f)
    if (s) launcher.setSource(withPath(s, bundlePath))
  }
  const retryUpload = async () => {
    const s = await file.retry()
    if (s) launcher.setSource(withPath(s, bundlePath))
  }
  const onFile = (e: ChangeEvent<HTMLInputElement>) => void load(e.target.files?.[0])
  const onPath = (v: string) => {
    setBundlePath(v)
    if (launcher.source) launcher.setSource(withPath(launcher.source, v))
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
  const uploading = file.phase === 'uploading'
  const up = file.progress
  const upPct = up && up.total ? Math.floor((up.loaded / up.total) * 100) : 0
  const fileError = file.error && file.error !== 'aborted' && file.error !== 'failed' ? t(`dataload.file.${file.error}`) : undefined
  const hint = file.chunked
    ? t('dataload.file.hint', { inline: formatBytes(file.inlineMaxBytes), max: formatBytes(file.maxBytes) })
    : t('dataload.file.hint_inline', { max: formatBytes(file.inlineMaxBytes) })

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
            {list.map((p) => (
              <option key={profileRef(p)} value={profileRef(p)}>
                {t(p.shared ? 'dataload.profile.option.shared' : 'dataload.profile.option', { name: p.name, version: p.version })}
              </option>
            ))}
          </select>
          {profiles.isSuccess && names.length === 0 ? <p className='m-0 text-xs text-muted-foreground'>{t('dataload.profile.none')}</p> : null}
        </div>
        <div className='flex flex-col gap-1.5'>
          <label htmlFor={fileId} className='text-sm font-medium'>{t('dataload.file')}</label>
          <input
            key={fileKey}
            id={fileId}
            type='file'
            accept='.csv,.tsv,.txt,.json,text/csv,application/json'
            className={cn(fieldCls, 'h-auto py-1.5 file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-secondary-foreground')}
            disabled={launcher.locked || uploading}
            onChange={onFile}
            aria-describedby={`${fileId}-hint`}
          />
          <p id={`${fileId}-hint`} className='m-0 text-xs text-muted-foreground'>{hint}</p>
          {fileError ? <p role='alert' className='m-0 text-sm text-destructive'>{fileError}</p> : null}
          {uploading || file.phase === 'failed' || file.phase === 'aborted' ? (
            <div className='flex flex-col gap-2 rounded-lg border bg-background p-2.5'>
              {up ? (
                <>
                  <Progress id={uploadId} value={upPct} aria-label={t('dataload.upload.label')} aria-valuenow={upPct} aria-valuemin={0} aria-valuemax={100} />
                  <p className='m-0 text-xs text-muted-foreground tabular-nums' aria-live='polite'>
                    {t('dataload.upload.progress', { loaded: formatBytes(up.loaded), total: formatBytes(up.total), part: up.part, parts: up.parts })}
                  </p>
                </>
              ) : null}
              {file.phase === 'failed' && file.error === 'failed' ? <p role='alert' className='m-0 text-sm text-destructive'>{t('dataload.upload.failed')}</p> : null}
              {file.phase === 'aborted' ? <p role='status' className='m-0 text-sm text-muted-foreground'>{t('dataload.upload.aborted')}</p> : null}
              <div className='flex flex-wrap gap-2'>
                {uploading ? (
                  <Button size='sm' variant='outline' onClick={file.cancel}>
                    <X className='size-4' aria-hidden />
                    {t('dataload.upload.cancel')}
                  </Button>
                ) : null}
                {file.phase === 'failed' && file.error === 'failed' ? (
                  <Button size='sm' variant='outline' onClick={() => void retryUpload()}>
                    <RefreshCw className='size-4' aria-hidden />
                    {t('dataload.upload.retry')}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          {launcher.source ? (
            <p className='m-0 break-all text-xs' role='status'>
              {'uploadId' in launcher.source ? t('dataload.upload.done', { name: launcher.source.name }) : t('dataload.file.selected', { name: launcher.source.name })}
            </p>
          ) : null}
        </div>
        {isJson ? (
          <div className='flex flex-col gap-1.5'>
            <label htmlFor={pathId} className='text-sm font-medium'>{t('dataload.bundle_path')}</label>
            <input
              id={pathId}
              className={fieldCls}
              value={bundlePath}
              disabled={launcher.locked || uploading}
              onChange={(e) => onPath(e.target.value)}
              aria-describedby={`${pathId}-hint`}
            />
            <p id={`${pathId}-hint`} className='m-0 text-xs text-muted-foreground'>{t('dataload.bundle_path.hint')}</p>
          </div>
        ) : null}
        {showOverrides && stored && resolved.data ? (
          <details className='rounded-lg border bg-background p-2.5'>
            <summary className='cursor-pointer text-sm font-medium focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'>
              {t('dataload.overrides.title')}
            </summary>
            <OverridesEditor
              key={profileRef(stored)}
              className='mt-3'
              api={api}
              profile={resolved.data.profile}
              profileRef={resolved.data.baseRef}
              value={launcher.overrides ?? resolved.data.overrides}
              onChange={(o) => launcher.setOverrides(o, resolved.data!.baseRef)}
              publish={{ name: stored.name, base: resolved.data.baseKey, suggestVersion }}
              disabled={launcher.locked}
              embedded
              {...i18n}
              capabilities={caps}
              notify={notify}
            />
          </details>
        ) : null}
        <div className='flex flex-wrap gap-2'>
          <Button
            disabled={!launcher.ready || launcher.locked || phase === 'planning' || uploading}
            onClick={() => guard(() => launcher.dryRun(), t('dataload.dry_run.error'))}
          >
            <FileUp className='size-4' aria-hidden />
            {phase === 'planning' ? t('dataload.dry_running') : t('dataload.dry_run')}
          </Button>
          {phase !== 'idle' || fileName ? (
            <Button
              variant='ghost'
              disabled={inFlight}
              onClick={() => {
                file.clear()
                launcher.reset()
                setFileName(undefined)
                setBundlePath('')
                setFileKey((k) => k + 1)
              }}
            >
              <RotateCcw className='size-4' aria-hidden />
              {t('dataload.reset')}
            </Button>
          ) : null}
        </div>
        {launcher.planChanged ? (
          <p role='alert' className='m-0 break-words text-sm text-destructive'>{t('dataload.plan.changed')}</p>
        ) : launcher.error && phase !== 'planning' ? (
          <p role='alert' className='m-0 break-words text-sm text-destructive'>{apiErrorMessage(launcher.error, t('dataload.dry_run.error'))}</p>
        ) : null}
      </Step>

      {plan ? (
        <Step n={2} title={t('dataload.step.review')}>
          {launcher.previewRun?.replayOf ? <p className='m-0 rounded-lg border bg-muted p-2.5 text-sm'>{t('dataload.summary.replay')}</p> : null}
          <PlanReview plan={plan} pageSize={pageSize} {...i18n} />
          {phase === 'planned' || phase === 'starting' ? (
            <div className='flex flex-col gap-2 border-t pt-3'>
              {caps.launch ? (
                <>
                  <label className='flex items-start gap-2 text-sm'>
                    <input type='checkbox' className={checkCls} checked={launcher.failOnInvalid} onChange={(e) => launcher.setFailOnInvalid(e.target.checked)} />
                    {t('dataload.fail_on_invalid')}
                  </label>
                  <label className='flex items-start gap-2 text-sm'>
                    <input type='checkbox' className={checkCls} checked={launcher.force} onChange={(e) => launcher.setForce(e.target.checked)} />
                    {t('dataload.force')}
                  </label>
                </>
              ) : null}
              {!canApply(plan) ? <p className='m-0 text-sm text-muted-foreground'>{t('dataload.nothing_to_apply')}</p> : null}
              {!caps.launch ? <p id={`${profileId}-noapply`} className='m-0 text-sm text-muted-foreground'>{t('dataload.apply.forbidden')}</p> : null}
              <Button
                className='self-start'
                disabled={!caps.launch || !canApply(plan) || phase === 'starting'}
                aria-describedby={!caps.launch ? `${profileId}-noapply` : undefined}
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
          <div aria-live='polite' aria-atomic='false'>
            <RunProgressView run={run} {...i18n} />
          </div>
          {phase === 'running' && caps.cancel ? (
            <Button variant='outline' className='self-start' disabled={actions.cancel.isPending} onClick={() => guard(() => actions.cancel.mutateAsync(run.id), t('dataload.cancel.error'))}>
              <Square className='size-4' aria-hidden />
              {t('dataload.cancel')}
            </Button>
          ) : null}
        </Step>
      ) : null}

      {showReviews ? <ReviewQueue api={api} entity={plan?.entity} hideWhenEmpty {...i18n} capabilities={caps} notify={notify} /> : null}
      {showMedia ? <MediaBackupPanel api={api} watch={inFlight || phase === 'finished'} {...i18n} capabilities={caps} notify={notify} /> : null}
      {showHistory ? <History api={api} t={t} locale={locale} /> : null}
    </div>
  )
}
