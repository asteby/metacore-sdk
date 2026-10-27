/**
 * «Devices»: the sessions the buyer has open, with a button to close each one and one to close all the others.
 * Headless: no styles of its own, `data-sf-session*` hooks and `classNames` slots. Every button is a real form
 * submit (`intent` = `session-revoke` | `session-revoke-others`), so it works without JavaScript and is answered by
 * `createAccountSettingsAction` (`@asteby/storefront-react/account/server`). The list comes from `loadAccountSessions`.
 *
 * Degradation: `sessions={null}` (the store could not list them, or its server is older than contract 1.9) renders a
 * calm notice instead of an error page, and the rest of the settings keeps working. The server sends no address and
 * no token, so there is nothing sensitive to leak here; the device label is plain text (never HTML).
 */
import type { CustomerSessionInfo } from '@asteby/storefront'
import { useId, type ComponentType, type ReactNode } from 'react'
import type { AccountFormProps } from './account-auth.js'
import { str } from './orders-ui.js'
import { settingsEnumText, type SettingsMessages } from './settings-messages.js'
import type { AccountSettingsActionData } from './settings-types.js'
import { errorText, resultFor, useSettingsText, type SettingsTextProps } from './settings-ui.js'

export type SessionsListClassNames = Partial<Record<'root' | 'title' | 'intro' | 'list' | 'item' | 'device' | 'badge' | 'meta' | 'revoke' | 'revokeOthers' | 'notice' | 'error' | 'empty', string>>

export type SessionsListProps = SettingsTextProps & {
  /** From `loadAccountSessions`. `null` = could not be loaded (the section degrades). */
  sessions: CustomerSessionInfo[] | null
  /** What the settings action returned (`useActionData()`); drives the confirmation and the errors. */
  data?: AccountSettingsActionData | null
  /** A submit is in flight: disables the buttons. */
  pending?: boolean
  /** Form component, e.g. React Router's `Form`. Default: the HTML `<form>`. */
  form?: 'form' | ComponentType<AccountFormProps>
  /** `action` of the forms: the route that mounts `createAccountSettingsAction`. Default: the current URL. */
  action?: string
  /** Heading level of the title (default 3). */
  headingLevel?: 2 | 3 | 4
  classNames?: SessionsListClassNames
  /** Extra content under the list. */
  children?: ReactNode
}

function methodText(m: SettingsMessages, method: unknown): string {
  return settingsEnumText(m, 'sessions.method', method)
}

export function SessionsList({ sessions, data, pending = false, form: FormTag = 'form', action, headingLevel = 3, classNames: cx = {}, children, ...text }: SessionsListProps) {
  const { m, t, date } = useSettingsText(text)
  const titleId = useId()
  const Heading = `h${headingLevel}` as 'h3'
  const result = resultFor(data, 'session-revoke', 'session-revoke-others')
  const list = (sessions ?? []).filter((s) => s && typeof s.id === 'string' && s.id)
  const others = list.filter((s) => !s.current)
  const formProps = { method: 'post' as const, ...(action ? { action } : {}) }

  return (
    <section className={cx.root} aria-labelledby={titleId} data-sf-sessions data-state={sessions === null ? 'degraded' : 'ready'}>
      <Heading id={titleId} className={cx.title}>
        {m['sessions.title']}
      </Heading>
      {sessions === null ? (
        <p className={cx.error} role="status" data-sf-sessions-degraded>
          {m['sessions.error']}
        </p>
      ) : (
        <>
          <p className={cx.intro}>{m['sessions.intro']}</p>
          {result?.ok ? (
            <p className={cx.notice} role="status" data-sf-sessions-notice>
              {result.intent === 'session-revoke-others' ? m['sessions.revokedOthers'] : m['sessions.revoked']}
            </p>
          ) : result?.error ? (
            <p className={cx.error} role="alert" data-sf-sessions-error={result.error.code}>
              {errorText(m, result.error)}
            </p>
          ) : null}
          <ul className={cx.list} aria-label={m['sessions.listLabel']} data-sf-sessions-list>
            {list.map((s) => {
              const device = str(s.device_label) ?? m['sessions.method.unknown']
              const last = date(s.last_used_at ?? null)
              const since = date(s.created_at)
              return (
                <li key={s.id} className={cx.item} data-sf-session data-current={s.current ? 'true' : 'false'}>
                  <p className={cx.device} data-sf-session-device>
                    {device}
                    {s.current ? (
                      <span className={cx.badge} data-sf-session-current>
                        {' '}
                        {m['sessions.current']}
                      </span>
                    ) : null}
                  </p>
                  <p className={cx.meta} data-sf-session-meta>
                    {methodText(m, s.login_method)}
                    {last ? ` · ${t('sessions.lastUsed', { date: last })}` : since ? ` · ${t('sessions.signedIn', { date: since })}` : ''}
                  </p>
                  {s.current ? null : (
                    <FormTag {...formProps} data-sf-account-form="">
                      <input type="hidden" name="session_id" value={s.id} />
                      <button type="submit" name="intent" value="session-revoke" disabled={pending} className={cx.revoke} aria-label={t('sessions.revokeLabel', { device })} data-sf-session-revoke>
                        {m['sessions.revoke']}
                      </button>
                    </FormTag>
                  )}
                </li>
              )
            })}
          </ul>
          {others.length === 0 ? (
            <p className={cx.empty} data-sf-sessions-empty>
              {m['sessions.none']}
            </p>
          ) : (
            <FormTag {...formProps} data-sf-account-form="">
              <button type="submit" name="intent" value="session-revoke-others" disabled={pending} className={cx.revokeOthers} data-sf-session-revoke-others>
                {m['sessions.revokeOthers']}
              </button>
            </FormTag>
          )}
        </>
      )}
      {children}
    </section>
  )
}
