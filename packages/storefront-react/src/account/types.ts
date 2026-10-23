/** What the account form and the server action share. Plain types: no React, no server code. */

/** What the buyer is doing. It is the `intent` field of the account form. */
export type AuthIntent = 'login' | 'register' | 'verify' | 'otp-request' | 'otp-login' | 'forgot' | 'reset'

/** Screen the form shows next, set by the action (`verify`: code of the registration; `otp`: code to sign in; `reset`: code + new password). */
export type AuthStep = 'verify' | 'otp' | 'reset'

export type AuthErrorCode =
  /** Wrong email or password. */
  | 'invalid_credentials'
  /** Wrong or expired code. */
  | 'invalid_code'
  /** The email already has an account. */
  | 'email_taken'
  /** Too many attempts: wait and try again. */
  | 'rate_limited'
  /** A field was rejected (`field` says which). */
  | 'validation'
  /** The store does not offer this way of signing in. */
  | 'unsupported'
  /**
   * The store's own credential lacks a permission (`403 insufficient_scope`): the shop is misconfigured, not the
   * buyer's data. The buyer can still check out as a guest; the server already logged how to repair it.
   */
  | 'store_misconfigured'
  /** Anything else (network, server). */
  | 'unavailable'

/** What the action returns when it does not redirect. Texts are NOT here: `<AccountAuth>` writes them (i18n). */
export type AuthActionData = {
  ok: boolean
  /** Next screen of the form. */
  step?: AuthStep
  /** Email the flow is about, to carry it to the next screen. */
  email?: string
  error?: { code: AuthErrorCode; field?: string }
}
