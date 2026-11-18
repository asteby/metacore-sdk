import * as React from 'react'
import { ActionChain, type ActionOptions } from './action-chain'
import { incompleteActions } from './actions'
import { inboundProblems } from './target-utils'
import { whenProblems } from './policy-utils'
import { CredentialOnce } from './credential-once'
import type { TFunction } from './i18n'
import { MAX_CONDITION_IN, type InboundContract, type InboundEndpoint, type IntegrationsApi, type OneTimeCredential } from './types'
import { cx, ErrorNote, Field, useAsync } from './ui'

export interface InboundTabProps {
  api: IntegrationsApi
  t: TFunction
}

const EMPTY: InboundEndpoint = { name: '', contract_key: '', actions: [], on_error: 'stop', enabled: true }

export function InboundTab({ api, t }: InboundTabProps) {
  const list = useAsync(() => api.listInbound(), [api])
  const contracts = useAsync(() => api.listInboundContracts(), [api])
  const options = useAsync<ActionOptions>(async () => {
    const [targets, models, commands, templates] = await Promise.all([
      api.listTargets?.().catch(() => undefined),
      api.listTargets ? undefined : api.listModels?.().catch(() => undefined),
      api.listCommands?.().catch(() => undefined),
      api.listNotifyTemplates?.().catch(() => undefined),
    ])
    return { targets, models: targets ? targets.map((x) => x.model) : models, commands, templates }
  }, [api])
  const [editing, setEditing] = React.useState<InboundEndpoint | null>(null)
  const [credential, setCredential] = React.useState<OneTimeCredential | null>(null)

  if (credential) {
    return (
      <CredentialOnce
        credential={credential}
        t={t}
        onDone={() => {
          setCredential(null)
          list.reload()
        }}
      />
    )
  }

  if (editing) {
    return (
      <InboundForm
        key={editing.id ?? 'new'}
        initial={editing}
        api={api}
        t={t}
        contracts={contracts.data ?? []}
        options={options.data}
        onCancel={() => setEditing(null)}
        onSaved={(cred) => {
          setEditing(null)
          if (cred) setCredential(cred)
          else list.reload()
        }}
      />
    )
  }

  return (
    <section aria-label={t('in.title')} className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('in.title')}</h2>
        <button type="button" className={cx.primary} onClick={() => setEditing({ ...EMPTY })}>
          {t('common.new')}
        </button>
      </div>
      {list.loading ? <p className={cx.muted}>{t('common.loading')}</p> : null}
      <ErrorNote error={list.error ?? contracts.error} t={t} />
      {!list.loading && !list.error && (list.data?.length ?? 0) === 0 ? <p className={cx.muted}>{t('common.empty')}</p> : null}
      <ul className="space-y-2">
        {(list.data ?? []).map((ep) => (
          <li key={ep.id ?? ep.name} className={`${cx.card} flex items-center justify-between gap-3`}>
            <div className="min-w-0">
              <p className="font-medium">{ep.name}</p>
              <p className={`${cx.muted} truncate`}>
                {ep.contract_key} · {ep.actions.length}
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" className={cx.button} onClick={() => setEditing({ ...ep })}>
                {t('common.edit')}
              </button>
              {api.deleteInbound && ep.id ? (
                <button
                  type="button"
                  className={cx.button}
                  onClick={async () => {
                    await api.deleteInbound!(ep.id!)
                    list.reload()
                  }}
                >
                  {t('common.delete')}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function InboundForm({
  initial,
  api,
  t,
  contracts,
  options,
  onCancel,
  onSaved,
}: {
  initial: InboundEndpoint
  api: IntegrationsApi
  t: TFunction
  contracts: InboundContract[]
  options?: ActionOptions
  onCancel: () => void
  onSaved: (credential?: OneTimeCredential) => void
}) {
  const [d, setD] = React.useState<InboundEndpoint>(initial)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<unknown>(null)
  const [problems, setProblems] = React.useState<string[]>([])
  const [rotated, setRotated] = React.useState<OneTimeCredential | null>(null)
  const patch = (p: Partial<InboundEndpoint>) => setD((x) => ({ ...x, ...p }))

  const save = async () => {
    const errs: string[] = []
    if (d.name.trim() === '') errs.push(t('in.needName'))
    if (d.contract_key === '') errs.push(t('in.needContract'))
    for (const i of incompleteActions(d.actions)) errs.push(`${t('actions.step', { n: i + 1 })}: ${t(`actions.${d.actions[i]!.do}`)}`)
    // `when` is checked with or without a catalogue (OPS accepts eq|ne|in, 1 to 50 values).
    d.actions.forEach((a, step) => {
      for (const p of whenProblems(a)) errs.push(`${t('actions.step', { n: step + 1 })}: ${t('in.blocked.whenInvalid', { reason: t(`when.err.${p.vars.reason as 'path'}` as 'when.err.path', { max: MAX_CONDITION_IN }) })}`)
    })
    // Only with a server catalogue (listTargets); without it the legacy free text applies.
    if (options?.targets) {
      for (const p of inboundProblems(d.actions, options.targets)) errs.push(`${t('actions.step', { n: p.step + 1 })}: ${t(`in.blocked.${p.code}`, p.vars)}`)
    }
    setProblems(errs)
    if (errs.length > 0) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.saveInbound(d)
      onSaved(res.credential)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const rotate = async () => {
    if (!d.id || !api.rotateInboundCredential) return
    try {
      setRotated(await api.rotateInboundCredential(d.id))
    } catch (e) {
      setError(e)
    }
  }

  if (rotated) return <CredentialOnce credential={rotated} t={t} onDone={() => setRotated(null)} />

  return (
    <form
      className="space-y-4"
      aria-label={t('in.title')}
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <Field label={t('common.name')}>{({ id }) => <input id={id} className={cx.input} value={d.name} onChange={(e) => patch({ name: e.target.value })} />}</Field>
      <Field label={t('in.contract')}>
        {({ id }) => (
          <select id={id} className={cx.input} value={d.contract_key} onChange={(e) => patch({ contract_key: e.target.value })}>
            <option value="" />
            {contracts.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
                {c.source === 'template' ? ` (${t('in.contractTemplate')})` : ''}
              </option>
            ))}
          </select>
        )}
      </Field>
      {d.url ? (
        <Field label={t('in.url')}>{({ id }) => <input id={id} readOnly className={cx.input} value={d.url} onFocus={(e) => e.currentTarget.select()} />}</Field>
      ) : null}
      {d.id && api.rotateInboundCredential ? (
        <button type="button" className={cx.button} onClick={rotate}>
          {t('in.rotate')}
        </button>
      ) : null}
      <ActionChain actions={d.actions} onChange={(actions) => patch({ actions })} options={options} contractSchema={contracts.find((c) => c.key === d.contract_key)?.schema} t={t} />
      <Field label={t('in.onError')}>
        {({ id }) => (
          <select id={id} className={cx.input} value={d.on_error} onChange={(e) => patch({ on_error: e.target.value as InboundEndpoint['on_error'] })}>
            <option value="stop">{t('in.onError.stop')}</option>
            <option value="continue">{t('in.onError.continue')}</option>
          </select>
        )}
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={d.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
        {t('common.enabled')}
      </label>
      {problems.length > 0 ? (
        <ul role="alert" className={cx.error}>
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
      <ErrorNote error={error} t={t} />
      <div className="flex gap-2">
        <button type="submit" className={cx.primary} disabled={busy}>
          {busy ? t('common.saving') : t('common.save')}
        </button>
        <button type="button" className={cx.button} onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  )
}
