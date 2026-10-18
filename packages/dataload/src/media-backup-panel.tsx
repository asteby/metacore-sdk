import { AlertTriangle, DatabaseBackup, RefreshCw, ShieldCheck } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from '@asteby/metacore-ui'
import { apiErrorMessage, type DataloadApi } from './api'
import { useDataloadUi, type DataloadUiProps } from './context'
import { useDataloadActions, useMediaBackupStatus } from './hooks'
import { Stat } from './ui'
import { formatBytes, mediaHealth, type MediaHealth } from './utils'

export interface MediaBackupPanelProps extends DataloadUiProps {
  api: DataloadApi
  /** Limit the queue to one run; omit for the whole organization. */
  runId?: string
  /** Poll while something is being downloaded. Defaults to true. */
  watch?: boolean
  className?: string
}

const TONE: Record<MediaHealth, 'muted' | 'success' | 'info' | 'danger'> = {
  empty: 'muted',
  healthy: 'success',
  working: 'info',
  attention: 'danger',
}

/** Status of the immutable sha256 media backup: queue, manifest integrity, verify and retry. */
export function MediaBackupPanel({ api, runId, watch = true, className, ...ui }: MediaBackupPanelProps) {
  const { t, caps, notify } = useDataloadUi(ui)
  const status = useMediaBackupStatus(api, { runId, watch })
  const actions = useDataloadActions(api)
  const s = status.data
  const health = mediaHealth(s)
  const busy = !!s && (s.queue.pending > 0 || s.queue.running > 0)

  const verify = async () => {
    try {
      const r = await actions.verifyMedia.mutateAsync()
      const bad = r.missing.length + r.corrupt.length
      if (bad) notify?.error(t('dataload.media.verify.bad', { bad, checked: r.checked }))
      else notify?.success(t('dataload.media.verify.ok', { ok: r.ok, checked: r.checked }))
    } catch (e) {
      notify?.error(apiErrorMessage(e, t('dataload.media.verify.error')))
    }
  }
  const retry = async () => {
    try {
      const n = await actions.retryMedia.mutateAsync(runId)
      notify?.success(t('dataload.media.retry.done', { n }))
    } catch (e) {
      notify?.error(apiErrorMessage(e, t('dataload.media.retry.error')))
    }
  }

  return (
    <Card className={cn('py-4', className)} aria-busy={busy || undefined}>
      <CardHeader className='px-4'>
        <div className='flex flex-wrap items-center gap-2'>
          <DatabaseBackup className='size-4 text-primary' aria-hidden />
          <CardTitle className='text-base'><h2 className='m-0 text-base font-semibold'>{t('dataload.media.title')}</h2></CardTitle>
          <Badge variant={TONE[health]} aria-live='polite'>{t(`dataload.media.health.${health}`)}</Badge>
        </div>
        <CardDescription>{t('dataload.media.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-3 px-4'>
        {status.isError ? (
          <p role='alert' className='m-0 flex items-center gap-2 text-sm'>
            <AlertTriangle className='size-4 text-destructive' aria-hidden />
            {t('dataload.media.load_error')}
            <Button variant='outline' size='sm' onClick={() => status.refetch()}>{t('dataload.retry')}</Button>
          </p>
        ) : !s ? (
          <p role='status' className='m-0 text-sm text-muted-foreground'>{t('dataload.loading')}</p>
        ) : (
          <>
            <dl className='m-0 grid grid-cols-2 gap-2 sm:grid-cols-4'>
              <Stat label={t('dataload.media.total')} value={s.manifest.total} />
              <Stat label={t('dataload.media.size')} value={formatBytes(s.manifest.bytes)} />
              <Stat label={t('dataload.media.done')} value={s.queue.done} />
              <Stat label={t('dataload.media.pending')} value={s.queue.pending + s.queue.running} />
              <Stat label={t('dataload.media.dead')} value={s.queue.dead} warn={s.queue.dead > 0} />
              <Stat label={t('dataload.media.missing')} value={s.manifest.missing} warn={s.manifest.missing > 0} />
              <Stat label={t('dataload.media.corrupt')} value={s.manifest.corrupt} warn={s.manifest.corrupt > 0} />
            </dl>
            {s.dead.length > 0 ? (
              <details className='rounded-lg border bg-background p-2.5 text-sm'>
                <summary className='cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'>
                  {t('dataload.media.dead_list', { n: s.dead.length })}
                </summary>
                <ul className='m-0 mt-2 flex list-none flex-col gap-2 p-0'>
                  {s.dead.slice(0, 20).map((j) => (
                    <li key={j.id} className='min-w-0 text-xs'>
                      <span className='block break-all'>{j.url}</span>
                      <span className='text-muted-foreground'>
                        {j.lastError ? `${j.lastError} · ` : ''}
                        {t('dataload.media.attempts', { n: j.attempts })}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        )}
        <div className='flex flex-wrap gap-2'>
          {caps.verifyMedia ? (
            <Button variant='outline' size='sm' onClick={verify} disabled={actions.verifyMedia.isPending}>
              <ShieldCheck className='size-4' aria-hidden />
              {actions.verifyMedia.isPending ? t('dataload.media.verifying') : t('dataload.media.verify')}
            </Button>
          ) : null}
          {caps.retryMedia && s && s.queue.dead > 0 ? (
            <Button variant='outline' size='sm' onClick={retry} disabled={actions.retryMedia.isPending}>
              <RefreshCw className='size-4' aria-hidden />
              {t('dataload.media.retry')}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
