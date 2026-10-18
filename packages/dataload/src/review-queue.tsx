import { Fragment, useId, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronRight, ClipboardCheck, Play, X } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from '@asteby/metacore-ui'
import { apiErrorMessage, apiErrorStatus, type DataloadApi } from './api'
import { useDataloadUi, type DataloadUiProps } from './context'
import { useDataloadReviews, useDataloadRunPlan, useReviewActions } from './hooks'
import type { DataloadT } from './messages'
import { OPEN_REVIEW_STATES, type ReviewEntry, type ReviewState } from './types'
import { ACTION_TONE, DiffTable, REVIEW_TONE, RecordList, ReviewReasons, areaCls, checkCls, fieldCls, fmtDate } from './ui'

export interface ReviewQueueProps extends DataloadUiProps {
  api: DataloadApi
  /** Limit the queue to one entity (and the "apply approved" to it). */
  entity?: string
  /** Limit the queue to the rows held by one run. */
  runId?: string
  /** Initial state filter. Default `pending`. */
  defaultState?: ReviewState | 'all'
  /** Rows shown per page. Default 50. */
  pageSize?: number
  /** Render nothing while there is nothing to decide or apply (or the host did not mount the review endpoints). */
  hideWhenEmpty?: boolean
  className?: string
}

const STATES: ReviewState[] = ['pending', 'approved', 'applying', 'rejected', 'applied', 'superseded']
const rowId = (e: Pick<ReviewEntry, 'entity' | 'key'>) => `${e.entity}\u001f${e.key}`
/** Composite identities are joined with U+001F by the kernel; show them readable. */
export const displayKey = (k: string) => k.split('\u001f').join(' · ')
const isOpen = (e: ReviewEntry) => OPEN_REVIEW_STATES.includes(e.state)
const NOT_MOUNTED = [404, 405, 501]

/** Diff of a held row: from the plan stored with the run that held it, when it still has this version of the row. */
function ReviewDetail({ api, entry, t }: { api: DataloadApi; entry: ReviewEntry; t: DataloadT }) {
  // The stored plan is paginated on the server: ask for exactly this row (rows are numbered in order).
  const plan = useDataloadRunPlan(api, entry.runId, { offset: Math.max(0, entry.row - 1), limit: 1 })
  const row = plan.data?.rows.find((r) => r.key === entry.key && r.hash === entry.hash)
  const outcome = entry.outcome ?? row?.outcome
  return (
    <div className='flex flex-col gap-3 py-2'>
      <ReviewReasons items={entry.items} t={t} />
      {outcome === 'update' ? (
        plan.isLoading ? (
          <p role='status' className='m-0 text-xs text-muted-foreground'>{t('dataload.review.diff_loading')}</p>
        ) : row ? (
          <DiffTable diffs={row.diffs} t={t} caption={t('dataload.rows.row', { n: entry.row })} />
        ) : (
          <p className='m-0 text-xs text-muted-foreground'>{t('dataload.review.diff_unavailable')}</p>
        )
      ) : null}
      <div className='flex flex-col gap-1'>
        <p className='m-0 text-xs font-medium'>{outcome === 'create' ? t('dataload.diff.new_record') : t('dataload.review.record')}</p>
        <RecordList record={entry.record} t={t} max={24} />
      </div>
    </div>
  )
}

/**
 * Queue of rows the extract stage held for review: reason, outcome and diff of
 * each one; approve or reject one or many with a comment; then apply the
 * approved ones. A decision is tied to the row's fingerprint, so a row that
 * changed since it was listed is rejected by the server and the queue reloads.
 */
export function ReviewQueue({ api, entity, runId, defaultState = 'pending', pageSize = 50, hideWhenEmpty, className, ...uiProps }: ReviewQueueProps) {
  const { t, locale, caps, notify } = useDataloadUi(uiProps)
  const [state, setState] = useState<ReviewState | 'all'>(defaultState)
  const [code, setCode] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [shown, setShown] = useState(pageSize)
  const [live, setLive] = useState('')
  const [error, setError] = useState<string | undefined>()
  const ids = { state: useId(), code: useId(), note: useId(), title: useId() }

  const list = useDataloadReviews(api, { entity, runId, ...(state !== 'all' ? { state } : {}), ...(code ? { code } : {}), limit: 500 })
  const approved = useDataloadReviews(api, { entity, state: 'approved', limit: 500 })
  const actions = useReviewActions(api)
  const entries = list.data ?? []
  const page = entries.slice(0, shown)
  const openOnPage = caps.approve ? page.filter(isOpen) : []
  const chosen = entries.filter((e) => selected.has(rowId(e)) && isOpen(e))
  const approvedCount = (approved.data ?? []).length

  // Codes seen so far stay in the filter even after narrowing by one of them.
  const codes = useRef(new Set<string>())
  for (const e of entries) for (const i of e.items) codes.current.add(i.code)

  const touched = state !== defaultState || code !== ''
  const notMounted = NOT_MOUNTED.includes(apiErrorStatus(list.error) ?? 0)
  if (hideWhenEmpty && (notMounted || (!touched && list.isSuccess && entries.length === 0 && approved.isSuccess && approvedCount === 0))) return null
  if (hideWhenEmpty && list.isLoading) return null

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }

  const decide = async (rows: ReviewEntry[], approve: boolean) => {
    if (!rows.length) return
    setError(undefined)
    try {
      const out = await actions.decide.mutateAsync(
        rows.map((e) => ({ entity: e.entity, key: e.key, hash: e.hash, approve, ...(note.trim() ? { note: note.trim() } : {}) })),
      )
      const msg = t('dataload.review.decided', { n: out.length })
      setLive(msg)
      notify?.success(msg)
      setSelected(new Set())
      setNote('')
    } catch (e) {
      const msg = apiErrorStatus(e) === 409 ? t('dataload.review.stale') : apiErrorMessage(e, t('dataload.review.decide.error'))
      setError(msg)
      setLive(msg)
      notify?.error(msg)
    }
  }

  const applyApproved = async () => {
    setError(undefined)
    const entities = entity ? [entity] : [...new Set((approved.data ?? []).map((e) => e.entity))]
    try {
      const sum = { created: 0, updated: 0, unchanged: 0 }
      for (const en of entities) {
        const run = await actions.applyApproved.mutateAsync(en)
        sum.created += run.progress.created
        sum.updated += run.progress.updated
        sum.unchanged += run.progress.unchanged
      }
      const msg = t('dataload.review.applied', sum)
      setLive(msg)
      notify?.success(msg)
    } catch (e) {
      const msg = apiErrorMessage(e, t('dataload.review.apply.error'))
      setError(msg)
      setLive(msg)
      notify?.error(msg)
    }
  }

  const busy = actions.decide.isPending || actions.applyApproved.isPending
  const allOnPage = openOnPage.length > 0 && openOnPage.every((e) => selected.has(rowId(e)))
  const cols = caps.approve ? 7 : 6

  return (
    <Card className={cn('py-4', className)} aria-labelledby={ids.title} aria-busy={busy || undefined}>
      <CardHeader className='px-4'>
        <div className='flex flex-wrap items-center gap-2'>
          <ClipboardCheck className='size-4 text-primary' aria-hidden />
          <CardTitle className='text-base'><h2 id={ids.title} className='m-0 text-base font-semibold'>{t('dataload.review.title')}</h2></CardTitle>
          {approvedCount > 0 ? <Badge variant='success'>{t('dataload.review.state.approved')}: {approvedCount}</Badge> : null}
        </div>
        <CardDescription>{t('dataload.review.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-3 px-4'>
        <p className='sr-only' aria-live='polite' role='status'>{live}</p>
        {!caps.approve ? <p className='m-0 text-sm text-muted-foreground'>{t('dataload.review.read_only')}</p> : null}

        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
          <div className='flex min-w-0 flex-col gap-1.5'>
            <label htmlFor={ids.state} className='text-sm font-medium'>{t('dataload.review.filter.state')}</label>
            <select id={ids.state} className={fieldCls} value={state} onChange={(e) => { setState(e.target.value as ReviewState | 'all'); setSelected(new Set()); setShown(pageSize) }}>
              <option value='all'>{t('dataload.review.filter.all_states')}</option>
              {STATES.map((s) => (
                <option key={s} value={s}>{t(`dataload.review.state.${s}`)}</option>
              ))}
            </select>
          </div>
          <div className='flex min-w-0 flex-col gap-1.5'>
            <label htmlFor={ids.code} className='text-sm font-medium'>{t('dataload.review.filter.code')}</label>
            <select id={ids.code} className={fieldCls} value={code} onChange={(e) => { setCode(e.target.value); setSelected(new Set()); setShown(pageSize) }}>
              <option value=''>{t('dataload.review.filter.any_code')}</option>
              {[...codes.current].sort().map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {list.isError && !notMounted ? (
          <p role='alert' className='m-0 flex flex-wrap items-center gap-2 text-sm'>
            {t('dataload.review.load_error')}
            <Button variant='outline' size='sm' onClick={() => list.refetch()}>{t('dataload.retry')}</Button>
          </p>
        ) : list.isLoading ? (
          <p role='status' className='m-0 text-sm text-muted-foreground'>{t('dataload.loading')}</p>
        ) : entries.length === 0 ? (
          <p className='m-0 text-sm text-muted-foreground'>{t('dataload.review.empty')}</p>
        ) : (
          <div className='max-w-full overflow-x-auto rounded-lg border focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50' role='region' aria-label={t('dataload.review.caption')} tabIndex={0}>
            <table className='w-full min-w-[40rem] border-collapse text-sm'>
              <caption className='sr-only'>{t('dataload.review.caption')}</caption>
              <thead className='bg-muted/50 text-left text-xs text-muted-foreground'>
                <tr>
                  {caps.approve ? (
                    <th scope='col' className='w-10 p-2'>
                      <span className='sr-only'>{t('dataload.review.col.select')}</span>
                      <input
                        type='checkbox'
                        className={checkCls}
                        aria-label={t('dataload.review.select_all')}
                        checked={allOnPage}
                        disabled={openOnPage.length === 0 || busy}
                        onChange={() => setSelected(allOnPage ? new Set() : new Set(openOnPage.map(rowId)))}
                      />
                    </th>
                  ) : null}
                  <th scope='col' className='p-2 font-medium'>{t('dataload.review.col.row')}</th>
                  <th scope='col' className='p-2 font-medium'>{t('dataload.review.col.key')}</th>
                  <th scope='col' className='p-2 font-medium'>{t('dataload.review.col.reasons')}</th>
                  <th scope='col' className='p-2 font-medium'>{t('dataload.review.col.outcome')}</th>
                  <th scope='col' className='p-2 font-medium'>{t('dataload.review.col.state')}</th>
                  <th scope='col' className='p-2 font-medium'>{t('dataload.review.col.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {page.map((e) => {
                  const id = rowId(e)
                  const open = expanded.has(id)
                  const decidable = caps.approve && isOpen(e)
                  const detailId = `${ids.title}-d-${e.row}`
                  return (
                    <Fragment key={id}>
                      <tr className='border-t align-top'>
                        {caps.approve ? (
                          <td className='p-2'>
                            {decidable ? (
                              <input
                                type='checkbox'
                                className={checkCls}
                                aria-label={t('dataload.review.select_row', { n: e.row })}
                                checked={selected.has(id)}
                                disabled={busy}
                                onChange={() => setSelected((s) => toggle(s, id))}
                              />
                            ) : null}
                          </td>
                        ) : null}
                        <th scope='row' className='p-2 text-left font-normal tabular-nums'>{e.row}</th>
                        <td className='max-w-[14rem] break-all p-2 font-medium'>{displayKey(e.key)}</td>
                        <td className='p-2'>
                          <ul className='m-0 flex list-none flex-wrap gap-1 p-0'>
                            {e.items.map((i, n) => (
                              <li key={`${i.code}-${n}`}><Badge variant={i.severity === 'revisar' ? 'warning' : 'muted'}>{i.code}</Badge></li>
                            ))}
                          </ul>
                        </td>
                        <td className='p-2'>{e.outcome ? <Badge variant={ACTION_TONE[e.outcome]}>{t(`dataload.outcome.${e.outcome}`)}</Badge> : null}</td>
                        <td className='p-2'>
                          <Badge variant={REVIEW_TONE[e.state]}>{t(`dataload.review.state.${e.state}`)}</Badge>
                          {e.decidedBy ? <span className='mt-1 block text-xs text-muted-foreground'>{t('dataload.review.decided_by', { who: e.decidedBy, when: fmtDate(e.decidedAt, locale, t('dataload.empty_value')) })}</span> : null}
                          {e.note ? <span className='mt-1 block max-w-[16rem] break-words text-xs'>{e.note}</span> : null}
                        </td>
                        <td className='p-2'>
                          <div className='flex flex-wrap gap-1'>
                            <Button
                              size='sm'
                              variant='ghost'
                              aria-expanded={open}
                              aria-controls={detailId}
                              aria-label={t('dataload.review.details_row', { n: e.row })}
                              onClick={() => setExpanded((s) => toggle(s, id))}
                            >
                              {open ? <ChevronDown className='size-4' aria-hidden /> : <ChevronRight className='size-4' aria-hidden />}
                              <span aria-hidden>{open ? t('dataload.review.hide_details') : t('dataload.review.details')}</span>
                            </Button>
                            {decidable ? (
                              <>
                                <Button size='sm' variant='outline' disabled={busy || e.state === 'approved'} aria-label={t('dataload.review.approve_row', { n: e.row })} onClick={() => decide([e], true)}>
                                  <Check className='size-4' aria-hidden />
                                  <span aria-hidden>{t('dataload.review.approve')}</span>
                                </Button>
                                <Button size='sm' variant='outline' disabled={busy || e.state === 'rejected'} aria-label={t('dataload.review.reject_row', { n: e.row })} onClick={() => decide([e], false)}>
                                  <X className='size-4' aria-hidden />
                                  <span aria-hidden>{t('dataload.review.reject')}</span>
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {open ? (
                        <tr id={detailId} className='bg-muted/20'>
                          <td colSpan={cols} className='px-3'>
                            <ReviewDetail api={api} entry={e} t={t} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {entries.length > shown ? (
          <Button variant='outline' size='sm' className='self-start' onClick={() => setShown((n) => n + pageSize)}>
            {t('dataload.rows.more', { n: entries.length - shown })}
          </Button>
        ) : null}

        {error ? <p role='alert' className='m-0 break-words text-sm text-destructive'>{error}</p> : null}

        {caps.approve ? (
          <div className='flex flex-col gap-2 border-t pt-3'>
            <div className='flex flex-col gap-1.5'>
              <label htmlFor={ids.note} className='text-sm font-medium'>{t('dataload.review.note')}</label>
              <textarea id={ids.note} className={areaCls} rows={2} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} aria-describedby={`${ids.note}-hint`} />
              <p id={`${ids.note}-hint`} className='m-0 text-xs text-muted-foreground'>{t('dataload.review.note.hint')}</p>
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='text-xs text-muted-foreground tabular-nums'>{t('dataload.review.selected', { n: chosen.length })}</span>
              <Button size='sm' disabled={busy || chosen.length === 0} onClick={() => decide(chosen, true)}>
                <Check className='size-4' aria-hidden />
                {t('dataload.review.approve_selected')}
              </Button>
              <Button size='sm' variant='outline' disabled={busy || chosen.length === 0} onClick={() => decide(chosen, false)}>
                <X className='size-4' aria-hidden />
                {t('dataload.review.reject_selected')}
              </Button>
              <Button size='sm' variant='secondary' className='sm:ml-auto' disabled={busy || approvedCount === 0} onClick={applyApproved}>
                <Play className='size-4' aria-hidden />
                {actions.applyApproved.isPending ? t('dataload.review.applying') : t('dataload.review.apply', { n: approvedCount })}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
