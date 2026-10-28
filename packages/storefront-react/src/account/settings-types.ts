/** What the account settings forms and their server action share. Plain types: no React, no server code. */

/** What the buyer is doing. It is the `intent` field of the settings forms. */
export type SettingsIntent =
  | 'session-revoke'
  | 'session-revoke-others'
  | 'locale'
  | 'notifications'
  | 'reauth-code-request'
  | 'export'
  | 'delete'

export type SettingsErrorCode =
  /** The buyer's session is gone (expired or closed elsewhere): ask them to sign in again. */
  | 'session_expired'
  /** The password or the code given to confirm identity is wrong. The same answer for any reason. */
  | 'invalid_credential'
  /** The action needs the buyer to confirm their password or a code first. */
  | 'reauth_required'
  /** Too many tries: wait (`retryAfter` seconds) and try again. */
  | 'rate_limited'
  /** A field was rejected (`field` says which). */
  | 'validation'
  /** Deleting the account: an order is still on its way. */
  | 'blocked_orders'
  /** Deleting the account: a payment is still pending. */
  | 'blocked_pending_payments'
  /** The store does not offer this (an older server, or the section is off). */
  | 'unsupported'
  /** Anything else (network, server). */
  | 'unavailable'

/** What the action returns when it does not redirect or send a file. Texts are NOT here: the components write them (i18n). */
export type AccountSettingsActionData = {
  ok: boolean
  /** Which form this answers, so each section shows only its own result. */
  intent?: SettingsIntent
  /** A value was saved (language, notifications). */
  saved?: boolean
  /** A sign-in code was sent to confirm identity (`reauth-code-request`). */
  codeSent?: boolean
  /** For `reauth-code-request`: the form that asked for the code (`export` | `delete`), so only it says «code sent». */
  for?: 'export' | 'delete'
  error?: { code: SettingsErrorCode; field?: string; retryAfter?: number }
}
