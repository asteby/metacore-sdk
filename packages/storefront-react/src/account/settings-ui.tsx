/** Small shared pieces of the settings screens: texts, dates and the error line. */
import { useResolvedLocale } from '../locale.js'
import { formatDate } from './orders-ui.js'
import { fill, settingsMessages, type SettingsMessageKey, type SettingsMessages } from './settings-messages.js'
import type { AccountSettingsActionData, SettingsIntent } from './settings-types.js'

export type SettingsTextProps = {
  /** BCP 47; defaults to the provider's, then `es-MX`. */
  locale?: string
  /** Per-key text overrides (a store's own words). */
  messages?: Partial<SettingsMessages>
  /** IANA time zone for dates. Pass the store's own to get the same text on server and browser. */
  timeZone?: string
}

export function useSettingsText({ locale, messages, timeZone }: SettingsTextProps) {
  const resolved = useResolvedLocale(locale)
  const m = settingsMessages(resolved, messages)
  const t = (key: SettingsMessageKey, vars?: Record<string, string | number>): string => (vars ? fill(m[key], vars) : m[key])
  const date = (iso: string | null | undefined): string | null => formatDate(iso, resolved, 'datetime', timeZone)
  return { locale: resolved, m, t, date }
}

/** The sentence for an error code (never the raw code, never a server message). */
export function errorText(m: SettingsMessages, error: NonNullable<AccountSettingsActionData['error']>): string {
  if (error.code === 'rate_limited' && typeof error.retryAfter === 'number' && error.retryAfter > 0) {
    return fill(m['settings.error.rate_limited_in'], { minutes: Math.max(1, Math.ceil(error.retryAfter / 60)) })
  }
  const key = `settings.error.${error.code}` as SettingsMessageKey
  return Object.prototype.hasOwnProperty.call(m, key) ? m[key] : m['settings.error.unavailable']
}

/** The result of the action when it answers THIS form (`intents`), else `null`. */
export function resultFor(data: AccountSettingsActionData | null | undefined, ...intents: SettingsIntent[]): AccountSettingsActionData | null {
  return data && data.intent && intents.includes(data.intent) ? data : null
}

