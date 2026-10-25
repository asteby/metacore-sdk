/**
 * Classification of the failures of a card payment (`POST pay` / `GET status`). No texts, no DOM, no server APIs: the
 * shop's server uses it to answer with `kind` and `retryable`, and the browser transport uses it to decide whether to
 * repeat, ask for the status or give up.
 *
 * Rule that never changes: an INDETERMINATE result (`transient`, `in_progress`) is never charged again with another
 * idempotency key; it is repeated with the SAME key or its status is read.
 */

export type PaymentErrorClassKind =
  /** OPS or the provider did not answer (5xx, timeout, network). The charge may or may not have happened. */
  | 'transient'
  /** A payment is already in progress for this order (409): read the status, do not charge again. */
  | 'in_progress'
  /** Too many attempts (429). */
  | 'rate_limited'
  /** Credentials or configuration of the merchant with the provider: not the buyer's fault. */
  | 'merchant_config'
  /** The provider refused the charge at API level (`payment_provider_rejected`): definitive, nothing was charged. */
  | 'provider_declined'
  /** The cart already became an order and OPS will not open a new attempt (`422 invalid_state`). */
  | 'stale_checkout'
  | 'expired'
  | 'price_mismatch'
  | 'store_closed'
  | 'validation'
  | 'other'

export type PaymentErrorClass = { kind: PaymentErrorClassKind; retryable: boolean }

export type PaymentErrorLike = {
  status?: number | null
  code?: string | null
  field?: string | null
  /** `error.retryable` as OPS declared it (`StorefrontError.retryable`). */
  retryable?: boolean | null
  /** `error.checkout_id` (`StorefrontError.checkoutId`). */
  checkoutId?: string | null
  /** Raw `error.details`; a `retryable` inside is honoured too (older bodies). */
  details?: unknown
}

/** Did OPS expressly say the failure must NOT be repeated (`retryable: false`, on the error or inside `details`)? */
export function opsSaysNotRetryable(err: PaymentErrorLike): boolean {
  if (err.retryable === false) return true
  const d = err.details
  return typeof d === 'object' && d !== null && (d as { retryable?: unknown }).retryable === false
}

/** Field the shop's server sets when IT refuses a payment row that is not offered (so it is not read as a stale checkout). */
export const PAYMENT_CHOICE_REFUSED_FIELD = 'payment_choice'

const MERCHANT_CONFIG_CODE = /credential|not_configured|unconfigured|invalid_access|access_token|provider_config|merchant|invalid_public_key|unauthorized/i

/**
 * What a payment failure means and whether repeating it can help. What OPS declares (`retryable`, stable codes) wins
 * over the HTTP status: a 502 with a stable code is an answer, not "no response".
 */
export function classifyPaymentError(err: PaymentErrorLike): PaymentErrorClass {
  const status = typeof err.status === 'number' ? err.status : 0
  const code = typeof err.code === 'string' ? err.code : ''
  if (code === 'store_not_ready') return { kind: 'store_closed', retryable: false }
  if (code === 'price_mismatch' || (status === 422 && err.field === 'expected_total')) return { kind: 'price_mismatch', retryable: false }
  if (status === 409 && (code === 'payment_in_progress' || err.field === 'payment_in_progress')) return { kind: 'in_progress', retryable: true }
  if (status === 409 && code === 'expired') return { kind: 'expired', retryable: false }
  if (status === 429 || code === 'too_many_attempts' || code === 'rate_limited') return { kind: 'rate_limited', retryable: true }
  if (status === 422 && code === 'invalid_state') {
    if (err.field === PAYMENT_CHOICE_REFUSED_FIELD) return { kind: 'other', retryable: false }
    return { kind: 'stale_checkout', retryable: false }
  }
  if (code === 'payment_provider_misconfigured') return { kind: 'merchant_config', retryable: false }
  if (code === 'payment_provider_rejected') return { kind: 'provider_declined', retryable: false }
  if (MERCHANT_CONFIG_CODE.test(code) || status === 401 || status === 403) return { kind: 'merchant_config', retryable: false }
  // OPS answered and said "do not repeat": definitive, not indeterminate (there is no lost answer to verify).
  if (status >= 500 && opsSaysNotRetryable(err)) return { kind: 'other', retryable: false }
  if (status === 0 || status >= 500 || code === 'network' || code === 'timeout' || code === 'unavailable') return { kind: 'transient', retryable: true }
  if (status === 400 || code === 'validation') return { kind: 'validation', retryable: false }
  return { kind: 'other', retryable: false }
}
