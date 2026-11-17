import * as React from 'react'
import { CredentialOnce } from './credential-once'
import { EventPicker } from './event-picker'
import type { TFunction } from './i18n'
import { MappingEditor } from './mapping-editor'
import { buildSamplePayload } from './schema'
import type { IntegrationsApi, OneTimeCredential, Subscription, SubscriptionDraft, TestResult } from './types'
import { cx, ErrorNote, Field, useAsync } from './ui'

export interface OutboundTabProps {
  api: IntegrationsApi
  t: TFunction
}

const EMPTY: SubscriptionDraft = { name: '', events: [], url: '', profile: 'default', filter: null, mapping: [], enabled: true }

export function validateSubscription(d: SubscriptionDraft, t: TFunction): string[] {
  const errs: string[] = []
  if (d.name.trim() === '') errs.push(t('out.needName'))
  if (d.events.length === 0) errs.push(t('out.needEvent'))
  if (!/^https:\/\/[^\s/]+/i.test(d.url.trim())) errs.push(t('out.needUrl'))
  return errs
}

export function OutboundTab({ api, t }: OutboundTabProps) {
  const subs = useAsync(() => api.listSubscriptions(), [api])
  const events = useAsync(() => api.listEvents(), [api])
  const profiles = useAsync(() => (api.listSigningProfiles ? api.listSigningProfiles() : Promise.resolve([{ key: 'default', label: 'default' }])), [api])
  const [editing, setEditing] = React.useState<SubscriptionDraft | null>(null)
  const [credential, setCredential] = React.useState<OneTimeCredential | null>(null)

  if (credential) {
    return (
      <CredentialOnce
        credential={credential}
        t={t}
        onDone={() => {
          setCredential(null)
          subs.reload()
        }}
      />
    )
  }

  if (editing) {
    return (
      <SubscriptionForm
        key={editing.id ?? 'new'}
        initial={editing}
        api={api}
        t={t}
        catalog={events.data ?? []}
        profiles={profiles.data ?? [{ key: 'default', label: 'default' }]}
        onCancel={() => setEditing(null)}
        onSaved={(cred) => {
          setEditing(null)
          if (cred) setCredential(cred)
          else subs.reload()
        }}
      />
    )
  }

  return (
    <section aria-label={t('out.title')} className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('out.title')}</h2>
        <button type="button" className={cx.primary} onClick={() => setEditing({ ...EMPTY })}>
          {t('common.new')}
        </button>
      </div>
      {subs.loading ? <p className={cx.muted}>{t('common.loading')}</p> : null}
      <ErrorNote error={subs.error ?? events.error} t={t} />
      {!subs.loading && !subs.error && (subs.data?.length ?? 0) === 0 ? <p className={cx.muted}>{t('common.empty')}</p> : null}
      <ul className="space-y-2">
        {(subs.data ?? []).map((s: Subscription) => (
          <li key={s.id ?? s.name} className={`${cx.card} flex items-center justify-between gap-3`}>
            <div className="min-w-0">
              <p className="font-medium">{s.name}</p>
              <p className={`${cx.muted} truncate`}>
                {s.url} · {s.events.length}
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" className={cx.button} onClick={() => setEditing({ ...s })}>
                {t('common.edit')}
              </button>
              {api.deleteSubscription && s.id ? (
                <button
                  type="button"
                  className={cx.button}
                  onClick={async () => {
                    await api.deleteSubscription!(s.id!)
                    subs.reload()
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

interface FormProps {
  initial: SubscriptionDraft
  api: IntegrationsApi
  t: TFunction
  catalog: import('./types').CatalogEvent[]
  profiles: { key: string; label: string }[]
  onCancel: () => void
  onSaved: (credential?: OneTimeCredential) => void
}

function SubscriptionForm({ initial, api, t, catalog, profiles, onCancel, onSaved }: FormProps) {
  const [d, setD] = React.useState<SubscriptionDraft>(initial)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<unknown>(null)
  const [problems, setProblems] = React.useState<string[]>([])
  const [test, setTest] = React.useState<TestResult | null>(null)
  const [testing, setTesting] = React.useState(false)
  const selected = React.useMemo(() => catalog.filter((e) => d.events.includes(e.name)), [catalog, d.events])
  const patch = (p: Partial<SubscriptionDraft>) => setD((x) => ({ ...x, ...p }))

  const save = async () => {
    const errs = validateSubscription(d, t)
    setProblems(errs)
    if (errs.length > 0) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.saveSubscription({ ...d, credential: d.credential?.trim() ? d.credential : undefined })
      onSaved(res.credential)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const runTest = async () => {
    const first = selected[0]
    if (!first) {
      setProblems([t('out.needEvent')])
      return
    }
    setTesting(true)
    setTest(null)
    try {
      const sample = buildSamplePayload(first.payload_schema)
      const res = await api.test(d.id ? { id: d.id } : { draft: d, event: first.name, sample })
      setTest(res)
    } catch (e) {
      setTest({ ok: false, error: e instanceof Error ? e.message : String(e) })
    } finally {
      setTesting(false)
    }
  }

  const first = selected[0]

  return (
    <form
      className="space-y-4"
      aria-label={t('out.title')}
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <Field label={t('common.name')}>{({ id }) => <input id={id} className={cx.input} value={d.name} onChange={(e) => patch({ name: e.target.value })} />}</Field>
      <EventPicker events={catalog} selected={d.events} onChange={(events) => patch({ events })} t={t} />
      <Field label={t('out.url')}>
        {({ id }) => <input id={id} type="url" inputMode="url" placeholder="https://" className={cx.input} value={d.url} onChange={(e) => patch({ url: e.target.value })} />}
      </Field>
      <Field label={t('out.profile')}>
        {({ id }) => (
          <select id={id} className={cx.input} value={d.profile} onChange={(e) => patch({ profile: e.target.value })}>
            {profiles.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={t('out.credential')} hint={d.has_credential ? t('out.credentialStored') : t('out.credentialHint')}>
        {({ id, describedBy }) => (
          <input
            id={id}
            type="password"
            autoComplete="off"
            aria-describedby={describedBy}
            className={cx.input}
            value={d.credential ?? ''}
            onChange={(e) => patch({ credential: e.target.value })}
          />
        )}
      </Field>
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className={cx.label}>{t('out.filter')}</legend>
        <input
          aria-label={t('out.filterPath')}
          placeholder={t('out.filterPath')}
          className={cx.input}
          value={d.filter?.path ?? ''}
          onChange={(e) => patch({ filter: e.target.value === '' && !d.filter?.eq ? null : { path: e.target.value, eq: d.filter?.eq ?? '' } })}
        />
        <input
          aria-label={t('out.filterValue')}
          placeholder={t('out.filterValue')}
          className={cx.input}
          value={d.filter?.eq ?? ''}
          onChange={(e) => patch({ filter: { path: d.filter?.path ?? '', eq: e.target.value } })}
        />
      </fieldset>
      <MappingEditor events={selected} rows={d.mapping} onChange={(mapping) => patch({ mapping })} t={t} />
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
      <div aria-live="polite" className="text-sm">
        {testing ? t('out.testing') : null}
        {test ? (test.ok ? t('out.testOk', { status: test.http_status ?? 200, ms: test.duration_ms ?? 0 }) : t('out.testFail', { message: test.error ?? String(test.http_status ?? '') })) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={cx.primary} disabled={busy}>
          {busy ? t('common.saving') : t('common.save')}
        </button>
        <button type="button" className={cx.button} disabled={testing || !first} onClick={runTest}>
          {t('out.test')}
        </button>
        <button type="button" className={cx.button} onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  )
}
