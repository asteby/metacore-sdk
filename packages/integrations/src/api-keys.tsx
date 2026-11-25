import * as React from 'react'
import type { TFunction } from './i18n'
import type { OneTimeCredential } from './types'
import { CredentialOnce } from './credential-once'
import { ErrorNote, Field, cx, useAsync } from './ui'

/** A permission a key can carry. `value` is what the backend stores (e.g. `support:write`). */
export interface ApiKeyScope {
  value: string
  label?: string
  description?: string
}

export type ApiKeyStatus = 'active' | 'revoked' | 'expired'

/** A key as listed. The secret is never part of it: only the prefix is shown. */
export interface ApiKey {
  id: string
  name: string
  /** First characters of the secret, safe to show (e.g. `sup_sk_AbCd…`). */
  prefix: string
  scopes: string[]
  status: ApiKeyStatus
  created_at?: string
  expires_at?: string | null
  last_used_at?: string | null
  /**
   * Set on a key that has been replaced by a rotation: it keeps working until this instant
   * (the overlap window). The UI shows it so nobody removes the old credential too early.
   */
  valid_until?: string | null
  rotated_from_id?: string | null
  rate_limit_per_minute?: number
  /** Host data shown as a secondary line (e.g. the device the key belongs to). */
  detail?: string
}

/** An extra required choice of the host (e.g. the device a key is bound to). */
export interface ApiKeyField {
  name: string
  label: string
  options: Array<{ value: string; label: string }>
}

export interface ApiKeyDraft {
  name: string
  scopes: string[]
  /** Lifetime in days; absent = never expires. */
  expires_in_days?: number
  rate_limit_per_minute?: number
  /** Values of the host-declared `fields`, by `name`. */
  fields: Record<string, string>
}

/** A newly issued key and its secret: the secret is only ever in this response. */
export interface IssuedApiKey {
  key: ApiKey
  secret: string
}

/** What the host implements over its own endpoints. Headless: no URL is known here. */
export interface ApiKeysApi {
  list(): Promise<ApiKey[]>
  create(draft: ApiKeyDraft): Promise<IssuedApiKey>
  /** Issues a replacement and keeps the old one valid for `graceSeconds` (0 = cut now). */
  rotate?(id: string, opts: { graceSeconds: number }): Promise<IssuedApiKey>
  revoke(id: string): Promise<void>
  remove?(id: string): Promise<void>
}

export interface ApiKeysManagerProps {
  api: ApiKeysApi
  scopes: ApiKeyScope[]
  t: TFunction
  /** Scopes ticked in the new-key form. */
  defaultScopes?: string[]
  /** Host choices bound to a key. */
  fields?: ApiKeyField[]
  /** Lifetimes offered, in days. Empty or absent = the form does not ask. */
  expiryOptions?: number[]
  /** Overlap choices of a rotation, in hours (0 = cut now). Defecto `[0, 1, 24, 72, 168]`. */
  graceHoursOptions?: number[]
  defaultGraceHours?: number
  /** Asks for a rate limit when set (the value is the default). */
  defaultRateLimit?: number
  /** Called after any change (issue, rotate, revoke, remove) so the host can refresh related data. */
  onChanged?: () => void
}

const DEFAULT_GRACE = [0, 1, 24, 72, 168]

function shortDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString()
}

/**
 * Key manager: list with prefix, issue with scopes, rotate with a visible overlap, revoke, and
 * show the secret ONCE (through `CredentialOnce`). The secret lives in this component's state
 * only until the user confirms; it is not written to storage nor kept after `onDone`.
 */
export function ApiKeysManager({
  api,
  scopes,
  t,
  defaultScopes = [],
  fields = [],
  expiryOptions = [],
  graceHoursOptions = DEFAULT_GRACE,
  defaultGraceHours = 24,
  defaultRateLimit,
  onChanged,
}: ApiKeysManagerProps) {
  const list = useAsync(() => api.list(), [api])
  const [issued, setIssued] = React.useState<{ secret: string; name: string } | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [rotating, setRotating] = React.useState<string | null>(null)
  const [revoking, setRevoking] = React.useState<string | null>(null)
  const [error, setError] = React.useState<unknown>(null)
  const [busy, setBusy] = React.useState(false)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      list.reload()
      onChanged?.()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  // While a secret is on screen nothing else is offered: it must be acknowledged first.
  if (issued) {
    const credential: OneTimeCredential = { value: issued.secret, label: t('keys.secretLabel', { name: issued.name }) }
    return <CredentialOnce credential={credential} onDone={() => setIssued(null)} t={t} />
  }

  const keys = list.data ?? []
  return (
    <section aria-label={t('keys.title')} className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">{t('keys.title')}</h3>
        {!creating ? (
          <button type="button" className={cx.primary} onClick={() => setCreating(true)}>
            {t('keys.new')}
          </button>
        ) : null}
      </div>
      <ErrorNote error={error ?? list.error} t={t} />

      {creating ? (
        <NewKeyForm
          scopes={scopes}
          fields={fields}
          t={t}
          busy={busy}
          defaultScopes={defaultScopes}
          expiryOptions={expiryOptions}
          defaultRateLimit={defaultRateLimit}
          onCancel={() => setCreating(false)}
          onSubmit={(draft) =>
            run(async () => {
              const res = await api.create(draft)
              setCreating(false)
              setIssued({ secret: res.secret, name: res.key.name })
            })
          }
        />
      ) : null}

      {list.loading && !list.data ? <p className={cx.muted}>{t('common.loading')}</p> : null}
      {!list.loading && keys.length === 0 && !list.error ? <p className={cx.muted}>{t('keys.empty')}</p> : null}

      <ul className="space-y-2">
        {keys.map((k) => (
          <li key={k.id} data-testid={`key-${k.id}`} className={`${cx.card} space-y-2`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{k.name}</span>
              <code className="text-xs text-muted-foreground">{k.prefix}</code>
              <span className="rounded border px-2 py-0.5 text-xs">{t(`keys.status.${k.status}` as 'keys.status.active')}</span>
            </div>
            <p className={cx.muted}>{k.scopes.join(', ')}</p>
            {k.detail ? <p className={cx.muted}>{k.detail}</p> : null}
            <p className={cx.muted}>
              {[
                k.created_at ? t('keys.created', { date: shortDate(k.created_at) }) : '',
                k.last_used_at ? t('keys.lastUsed', { date: shortDate(k.last_used_at) }) : t('keys.neverUsed'),
                k.expires_at ? t('keys.expiresOn', { date: shortDate(k.expires_at) }) : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {k.valid_until && k.status === 'active' ? (
              <p role="status" className="text-sm text-amber-600">
                {t('keys.overlap', { date: shortDate(k.valid_until) })}
              </p>
            ) : null}

            {k.status === 'active' ? (
              <div className="flex flex-wrap gap-2">
                {api.rotate ? (
                  <button type="button" className={cx.button} disabled={busy} onClick={() => setRotating(rotating === k.id ? null : k.id)}>
                    {t('keys.rotate')}
                  </button>
                ) : null}
                <button type="button" className={cx.button} disabled={busy} onClick={() => setRevoking(revoking === k.id ? null : k.id)}>
                  {t('keys.revoke')}
                </button>
              </div>
            ) : api.remove ? (
              <button type="button" className={cx.button} disabled={busy} onClick={() => run(() => api.remove!(k.id))}>
                {t('keys.remove')}
              </button>
            ) : null}

            {rotating === k.id && api.rotate ? (
              <RotateForm
                t={t}
                busy={busy}
                options={graceHoursOptions}
                initial={defaultGraceHours}
                onSubmit={(hours) =>
                  run(async () => {
                    const res = await api.rotate!(k.id, { graceSeconds: hours * 3600 })
                    setRotating(null)
                    setIssued({ secret: res.secret, name: res.key.name })
                  })
                }
              />
            ) : null}

            {revoking === k.id ? (
              <div role="alert" className="flex flex-wrap items-center gap-2">
                <span className="text-sm">{t('keys.revokeConfirm', { name: k.name })}</span>
                <button
                  type="button"
                  className={cx.primary}
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api.revoke(k.id)
                      setRevoking(null)
                    })
                  }
                >
                  {t('keys.revoke')}
                </button>
                <button type="button" className={cx.button} onClick={() => setRevoking(null)}>
                  {t('common.cancel')}
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

function RotateForm({
  t,
  busy,
  options,
  initial,
  onSubmit,
}: {
  t: TFunction
  busy: boolean
  options: number[]
  initial: number
  onSubmit: (hours: number) => void
}) {
  const [hours, setHours] = React.useState(options.includes(initial) ? initial : (options[0] ?? 0))
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(hours)
      }}
    >
      <Field label={t('keys.rotateGrace')}>
        {({ id }) => (
          <select id={id} className={cx.input} value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {options.map((h) => (
              <option key={h} value={h}>
                {h === 0 ? t('keys.graceNow') : t('keys.graceHours', { hours: h })}
              </option>
            ))}
          </select>
        )}
      </Field>
      <button type="submit" className={cx.primary} disabled={busy}>
        {t('keys.rotateConfirm')}
      </button>
    </form>
  )
}

function NewKeyForm({
  scopes,
  fields,
  t,
  busy,
  defaultScopes,
  expiryOptions,
  defaultRateLimit,
  onCancel,
  onSubmit,
}: {
  scopes: ApiKeyScope[]
  fields: ApiKeyField[]
  t: TFunction
  busy: boolean
  defaultScopes: string[]
  expiryOptions: number[]
  defaultRateLimit?: number
  onCancel: () => void
  onSubmit: (draft: ApiKeyDraft) => void
}) {
  const [name, setName] = React.useState('')
  const [picked, setPicked] = React.useState<string[]>(defaultScopes)
  const [days, setDays] = React.useState<number | undefined>(undefined)
  const [rate, setRate] = React.useState<number | undefined>(defaultRateLimit)
  const [extra, setExtra] = React.useState<Record<string, string>>({})
  const [problem, setProblem] = React.useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setProblem(t('keys.needName'))
    if (picked.length === 0) return setProblem(t('keys.needScope'))
    const missing = fields.find((f) => !extra[f.name])
    if (missing) return setProblem(t('keys.needField', { field: missing.label }))
    setProblem(null)
    onSubmit({ name: name.trim(), scopes: picked, expires_in_days: days, rate_limit_per_minute: rate, fields: extra })
  }

  return (
    <form onSubmit={submit} className={`${cx.card} space-y-3`}>
      <Field label={t('keys.name')}>{({ id }) => <input id={id} className={cx.input} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
      {fields.map((f) => (
        <Field key={f.name} label={f.label}>
          {({ id }) => (
            <select id={id} className={cx.input} value={extra[f.name] ?? ''} onChange={(e) => setExtra({ ...extra, [f.name]: e.target.value })}>
              <option value="" />
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      ))}
      <fieldset className="space-y-1">
        <legend className={cx.label}>{t('keys.scopes')}</legend>
        {scopes.map((s) => (
          <label key={s.value} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={picked.includes(s.value)}
              onChange={(e) => setPicked(e.target.checked ? [...picked, s.value] : picked.filter((v) => v !== s.value))}
            />
            <span>
              {s.label ?? s.value}
              {s.description ? <span className={`${cx.muted} block`}>{s.description}</span> : null}
            </span>
          </label>
        ))}
      </fieldset>
      {expiryOptions.length > 0 ? (
        <Field label={t('keys.expires')}>
          {({ id }) => (
            <select id={id} className={cx.input} value={days ?? ''} onChange={(e) => setDays(e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">{t('keys.expiresNever')}</option>
              {expiryOptions.map((d) => (
                <option key={d} value={d}>
                  {t('keys.expiresDays', { days: d })}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}
      {defaultRateLimit !== undefined ? (
        <Field label={t('keys.rateLimit')}>
          {({ id }) => (
            <input id={id} type="number" min={1} className={cx.input} value={rate ?? ''} onChange={(e) => setRate(e.target.value ? Number(e.target.value) : undefined)} />
          )}
        </Field>
      ) : null}
      {problem ? (
        <p role="alert" className={cx.error}>
          {problem}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="submit" className={cx.primary} disabled={busy}>
          {busy ? t('keys.creating') : t('keys.create')}
        </button>
        <button type="button" className={cx.button} onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  )
}
