import * as React from 'react'
import type { TFunction } from './i18n'
import type { IntegrationsApi, LogEntry, LogQuery, LogStatus } from './types'
import { cx, ErrorNote, useAsync } from './ui'

export interface LogTabProps {
  api: IntegrationsApi
  t: TFunction
  locale?: string
}

const STATUSES: LogStatus[] = ['delivered', 'failed', 'pending', 'duplicate']

export function LogTab({ api, t, locale }: LogTabProps) {
  const [direction, setDirection] = React.useState<'' | 'out' | 'in'>('')
  const [status, setStatus] = React.useState<'' | LogStatus>('')
  const [extra, setExtra] = React.useState<LogEntry[]>([])
  const [cursor, setCursor] = React.useState<string | undefined>()
  const [note, setNote] = React.useState('')
  const [error, setError] = React.useState<unknown>(null)
  const query: LogQuery = { direction: direction || undefined, status: status || undefined }

  const page = useAsync(() => api.listLog(query), [api, direction, status])
  const queue = useAsync(() => (api.queueStatus ? api.queueStatus() : Promise.resolve(undefined)), [api])
  React.useEffect(() => {
    setExtra([])
    setCursor(undefined)
  }, [direction, status])

  const items = [...(page.data?.items ?? []), ...extra]
  const next = cursor ?? page.data?.next_cursor
  const dirId = React.useId()
  const statusId = React.useId()

  const more = async () => {
    try {
      const p = await api.listLog({ ...query, cursor: next })
      setExtra((e) => [...e, ...p.items])
      setCursor(p.next_cursor ?? '')
    } catch (e) {
      setError(e)
    }
  }
  const replay = async (id: string) => {
    setError(null)
    try {
      await api.replay(id)
      setNote(t('log.replayed'))
      page.reload()
      queue.reload()
    } catch (e) {
      setError(e)
    }
  }
  const fmt = (iso: string) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(locale)
  }

  return (
    <section aria-label={t('log.title')} className="space-y-3">
      <h2 className="text-lg font-semibold">{t('log.title')}</h2>
      <div className="flex flex-wrap gap-3">
        <div>
          <label htmlFor={dirId} className={cx.label}>
            {t('log.direction')}
          </label>
          <select id={dirId} className={cx.input} value={direction} onChange={(e) => setDirection(e.target.value as '' | 'out' | 'in')}>
            <option value="">{t('log.all')}</option>
            <option value="out">{t('log.out')}</option>
            <option value="in">{t('log.in')}</option>
          </select>
        </div>
        <div>
          <label htmlFor={statusId} className={cx.label}>
            {t('log.status')}
          </label>
          <select id={statusId} className={cx.input} value={status} onChange={(e) => setStatus(e.target.value as '' | LogStatus)}>
            <option value="">{t('log.all')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {queue.data ? <p className={cx.muted}>{t('log.queue', { pending: queue.data.pending, failed: queue.data.failed })}</p> : null}
      <p aria-live="polite" className={cx.muted}>
        {note}
      </p>
      {page.loading ? <p className={cx.muted}>{t('common.loading')}</p> : null}
      <ErrorNote error={page.error ?? error} t={t} />
      {!page.loading && !page.error && items.length === 0 ? <p className={cx.muted}>{t('common.empty')}</p> : null}
      {items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('log.title')}</caption>
            <thead>
              <tr className="text-left">
                <th scope="col">{t('log.when')}</th>
                <th scope="col">{t('log.direction')}</th>
                <th scope="col">{t('log.event')}</th>
                <th scope="col">{t('log.endpoint')}</th>
                <th scope="col">{t('log.status')}</th>
                <th scope="col">{t('log.attempts')}</th>
                <th scope="col">
                  <span className="sr-only">{t('log.replay')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t" data-status={it.status}>
                  <td>{fmt(it.at)}</td>
                  <td>{t(it.direction === 'out' ? 'log.out' : 'log.in')}</td>
                  <td>
                    <code>{it.event}</code>
                  </td>
                  <td>{it.endpoint}</td>
                  <td>
                    {t(`status.${it.status}`)}
                    {it.http_status ? ` (${it.http_status})` : ''}
                    {it.error ? <span className={`block ${cx.error}`}>{it.error}</span> : null}
                  </td>
                  <td>{it.attempts ?? 1}</td>
                  <td>
                    {it.status === 'failed' ? (
                      <button type="button" className={cx.button} onClick={() => replay(it.id)} aria-label={`${t('log.replay')} ${it.event}`}>
                        {t('log.replay')}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {next ? (
        <button type="button" className={cx.button} onClick={more}>
          {t('log.more')}
        </button>
      ) : null}
    </section>
  )
}
