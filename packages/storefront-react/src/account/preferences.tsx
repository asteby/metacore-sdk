/**
 * Language and notification preferences of the buyer. Headless: no styles of its own, `data-sf-lang*` /
 * `data-sf-notif*` hooks and `classNames` slots. Both are real form submits answered by
 * `createAccountSettingsAction` (`intent` = `locale` | `notifications`), so they work without JavaScript.
 *
 * Degradation: nothing to choose, nothing rendered. `<LanguagePreference>` needs at least two languages;
 * `<NotificationPreferences>` needs at least one channel the store can deliver on (`capabilities.notifications
 * .channels`; absent on a server older than contract 1.9). A store that composes the page does not need an `if`.
 *
 * What is NOT here on purpose: the confirmation of the order, the payments and the invoices cannot be turned off, so
 * they are not boxes to uncheck, and the page says so. Marketing is a consent (it has a legal record), not a box here.
 */
import type { CustomerPreferences } from '@asteby/storefront'
import { useId, type ComponentType, type ReactNode } from 'react'
import type { AccountFormProps } from './account-auth.js'
import { str } from './orders-ui.js'
import { settingsEnumText } from './settings-messages.js'
import type { AccountSettingsActionData } from './settings-types.js'
import { errorText, resultFor, useSettingsText, type SettingsTextProps } from './settings-ui.js'

/** The optional events the server accepts (anything else is refused by it). */
export const NOTIFICATION_EVENTS = ['order_updates', 'shipping', 'restock'] as const

type SectionProps = SettingsTextProps & {
  data?: AccountSettingsActionData | null
  pending?: boolean
  /** Form component, e.g. React Router's `Form`. Default: the HTML `<form>`. */
  form?: 'form' | ComponentType<AccountFormProps>
  /** `action` of the form: the route that mounts `createAccountSettingsAction`. Default: the current URL. */
  action?: string
  headingLevel?: 2 | 3 | 4
  children?: ReactNode
}

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

export type LanguagePreferenceClassNames = Partial<Record<'root' | 'title' | 'form' | 'label' | 'select' | 'submit' | 'notice' | 'error', string>>

export type LanguagePreferenceProps = SectionProps & {
  /** The languages the store offers (`shop.locales`), as BCP 47 tags or `{ value, label }`. Fewer than two renders nothing. */
  locales: ReadonlyArray<string | { value: string; label?: string }> | null | undefined
  /** The buyer's current language (`customer.locale`); `null` = the store's own. */
  value?: string | null
  classNames?: LanguagePreferenceClassNames
}

function languageName(tag: string, inLocale: string): string {
  try {
    const name = new Intl.DisplayNames([inLocale], { type: 'language', languageDisplay: 'dialect' }).of(tag)
    return name ? name.charAt(0).toLocaleUpperCase(inLocale) + name.slice(1) : tag
  } catch {
    return tag
  }
}

export function LanguagePreference({ locales, value, data, pending = false, form: FormTag = 'form', action, headingLevel = 3, classNames: cx = {}, children, ...text }: LanguagePreferenceProps) {
  const { m, locale } = useSettingsText(text)
  const titleId = useId()
  const selectId = useId()
  const options = (locales ?? [])
    .map((l) => (typeof l === 'string' ? { value: l, label: undefined } : { value: l?.value, label: l?.label }))
    .filter((o): o is { value: string; label: string | undefined } => typeof o.value === 'string' && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/.test(o.value))
  if (options.length < 2) return null
  const Heading = `h${headingLevel}` as 'h3'
  const result = resultFor(data, 'locale')
  const current = options.find((o) => o.value.toLowerCase() === (value ?? '').toLowerCase())?.value ?? ''

  return (
    <section className={cx.root} aria-labelledby={titleId} data-sf-lang>
      <Heading id={titleId} className={cx.title}>
        {m['lang.title']}
      </Heading>
      <FormTag method="post" {...(action ? { action } : {})} className={cx.form} data-sf-account-form="">
        {result?.saved ? (
          <p className={cx.notice} role="status" data-sf-lang-notice>
            {m['settings.saved']}
          </p>
        ) : result?.error ? (
          <p className={cx.error} role="alert" data-sf-lang-error={result.error.code}>
            {errorText(m, result.error)}
          </p>
        ) : null}
        <label htmlFor={selectId} className={cx.label}>
          {m['lang.label']}
        </label>
        <select id={selectId} name="locale" defaultValue={current} className={cx.select} data-sf-lang-select>
          <option value="">{m['lang.default']}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {str(o.label) ?? languageName(o.value, locale)}
            </option>
          ))}
        </select>
        <button type="submit" name="intent" value="locale" disabled={pending} className={cx.submit} data-sf-lang-submit>
          {m['lang.save']}
        </button>
      </FormTag>
      {children}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type NotificationPreferencesClassNames = Partial<Record<'root' | 'title' | 'intro' | 'form' | 'table' | 'row' | 'event' | 'channel' | 'check' | 'required' | 'submit' | 'notice' | 'error', string>>

export type NotificationPreferencesProps = SectionProps & {
  /** `capabilities.notifications.channels`: the channels the store can deliver on. Empty or absent renders nothing. */
  channels: ReadonlyArray<string> | null | undefined
  /** `customer.preferences`. A choice never made counts as on (what the store sends today). */
  preferences?: CustomerPreferences | null
  /** Events to offer (default: all the optional ones). */
  events?: ReadonlyArray<string>
  classNames?: NotificationPreferencesClassNames
}

const TOKEN = /^[a-z][a-z0-9_]{0,31}$/

export function NotificationPreferences({ channels, preferences, events = NOTIFICATION_EVENTS, data, pending = false, form: FormTag = 'form', action, headingLevel = 3, classNames: cx = {}, children, ...text }: NotificationPreferencesProps) {
  const { m } = useSettingsText(text)
  const titleId = useId()
  const cols = Array.from(new Set((channels ?? []).filter((c): c is string => typeof c === 'string' && TOKEN.test(c))))
  const rows = Array.from(new Set(events.filter((e) => TOKEN.test(e))))
  if (cols.length === 0 || rows.length === 0) return null
  const Heading = `h${headingLevel}` as 'h3'
  const result = resultFor(data, 'notifications')
  const on = (event: string, channel: string): boolean => preferences?.notifications?.[event]?.[channel] !== false

  return (
    <section className={cx.root} aria-labelledby={titleId} data-sf-notif>
      <Heading id={titleId} className={cx.title}>
        {m['notif.title']}
      </Heading>
      <p className={cx.intro}>{m['notif.intro']}</p>
      <FormTag method="post" {...(action ? { action } : {})} className={cx.form} data-sf-account-form="">
        {result?.saved ? (
          <p className={cx.notice} role="status" data-sf-notif-notice>
            {m['settings.saved']}
          </p>
        ) : result?.error ? (
          <p className={cx.error} role="alert" data-sf-notif-error={result.error.code}>
            {errorText(m, result.error)}
          </p>
        ) : null}
        <table className={cx.table} aria-label={m['notif.matrixLabel']} data-sf-notif-table>
          <thead>
            <tr>
              <th scope="col">
                <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{m['notif.title']}</span>
              </th>
              {cols.map((c) => (
                <th key={c} scope="col" className={cx.channel} data-sf-notif-channel={c}>
                  {settingsEnumText(m, 'notif.channel', c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e} className={cx.row} data-sf-notif-row={e}>
                <th scope="row" className={cx.event}>
                  {settingsEnumText(m, 'notif.event', e)}
                </th>
                {cols.map((c) => {
                  const id = `${e}:${c}`
                  return (
                    <td key={c}>
                      {/* Every box shown is listed, so an unchecked one (which a browser does not send) is still read as «off». */}
                      <input type="hidden" name="pref_shown" value={id} />
                      <input type="checkbox" name="pref" value={id} defaultChecked={on(e, c)} className={cx.check} aria-label={`${settingsEnumText(m, 'notif.event', e)} · ${settingsEnumText(m, 'notif.channel', c)}`} />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className={cx.required} data-sf-notif-required>
          {m['notif.required']}
        </p>
        <button type="submit" name="intent" value="notifications" disabled={pending} className={cx.submit} data-sf-notif-submit>
          {m['notif.save']}
        </button>
      </FormTag>
      {children}
    </section>
  )
}
