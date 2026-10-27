import type { StorefrontError } from './errors.js'

/**
 * Account settings of the buyer (contract 1.9): active sessions, recent re-authentication, language and
 * notification preferences, data export and account deletion. Types and small pure helpers; the calls live on
 * `client.customer`.
 */

/** Notification preferences: event → channel → on. Only optional events can be configured (never the order confirmation or the invoice). */
export type CustomerPreferences = {
  notifications?: Record<string, Record<string, boolean>>
}

/** One session of the buyer for a «Devices» list. The server never sends an address or a token. */
export type CustomerSessionInfo = {
  id: string
  /** `true` for the session that made the request. */
  current: boolean
  /** A summary such as «Chrome · Windows». Never a full user agent. */
  device_label: string
  login_method: 'email' | 'phone' | 'password' | (string & {})
  last_used_at?: string | null
  created_at: string
}

/** What proves the buyer is who they say: the password, or a sign-in code requested with `customer.requestOtp`. Exactly one. */
export type ReauthInput = { password: string; otp_code?: never } | { otp_code: string; password?: never }

export type ReauthResult = {
  reauth_at: string
  /** How long the confirmation lasts (seconds). It applies to the session that made the call, nowhere else. */
  valid_for_seconds?: number
}

/** The buyer's data as a JSON file, in memory. `content_base64` is the file; serve it as a download and do not keep it. */
export type DataExportFile = {
  filename: string
  content_type: string
  content_base64: string
}

/** `DELETE /customer`. `confirm` is the text your interface asked the buyer to type. */
export type AccountDeleteInput = { confirm: string }

/**
 * `true` when a call was refused because the buyer must confirm their password or a code first
 * (`403` with code `reauth_required`): show your confirmation step, call `customer.reauth`, and repeat the call.
 */
export function isReauthRequired(error: unknown): error is StorefrontError {
  const e = error as { status?: unknown; code?: unknown } | null
  return !!e && typeof e === 'object' && e.status === 403 && e.code === 'reauth_required'
}

/**
 * `true` when deleting the account was refused because an order is on its way or a payment is still pending
 * (`409`; `field` says which: `orders` or `pending_payments`).
 */
export function isAccountDeleteBlocked(error: unknown): error is StorefrontError & { field: 'orders' | 'pending_payments' } {
  const e = error as { status?: unknown; field?: unknown } | null
  return !!e && typeof e === 'object' && e.status === 409 && (e.field === 'orders' || e.field === 'pending_payments')
}

/** Decodes `content_base64` of a data export. Throws `TypeError` when it is not valid base64. */
export function dataExportBytes(file: Pick<DataExportFile, 'content_base64'>): Uint8Array {
  const raw = typeof file.content_base64 === 'string' ? file.content_base64.replace(/\s+/g, '') : ''
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(raw) || raw.length % 4 === 1) throw new TypeError('data export is not valid base64')
  const bin = atob(raw)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** A download filename that is safe in a `Content-Disposition` header: no path, quotes, control characters or spaces. */
export function safeExportFilename(name: unknown, fallback = 'account-data.json'): string {
  const base = typeof name === 'string' ? (name.split(/[\\/]/).pop() ?? '') : ''
  const clean = base.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 80)
  return clean || fallback
}
