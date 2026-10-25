/**
 * Embedded payment presentation: the single source of the texts and states a
 * storefront shows around an in-page payment. Pure functions, no DOM: safe in
 * loaders, SSR and edge runtimes.
 *
 * Rules this module encodes (DISENO-PAGO-INTEGRADO-BRICKS):
 * - The server decides the outcome and the amount. Nothing here computes or
 *   compares money; `expected_total` is the server's own number echoed back.
 * - A rejection is explained with an actionable text built from the neutral
 *   `decline_code`. A raw provider code is never shown.
 * - Vouchers and redirects only trust https URLs.
 */
import { availabilityLocale, formatAvailabilityMessage, type AvailabilityLocale } from './availability.js'
import { StorefrontError } from './errors.js'
import type { DeclineCode, Money, PaymentAction, PaymentAttemptResult, PaymentNextStep, PaymentVoucher } from './types.js'

export type PaymentLocale = AvailabilityLocale

export type PaymentMessageKey =
  | `decline.${DeclineCode}`
  | 'state.loading'
  | 'state.processing'
  | 'state.approved'
  | 'state.in_review'
  | 'state.voucher'
  | 'state.challenge'
  | 'state.expired'
  | 'state.cancelled'
  | 'state.redirect'
  | 'state.fallback'
  | 'error.network'
  | 'error.card_data'
  | 'error.price_mismatch'
  | 'error.payment_in_progress'
  | 'error.expired'
  | 'error.too_many_attempts'
  | 'error.generic'
  | 'action.retry'
  | 'action.try_again'
  | 'action.pay'
  | 'action.cancel'
  | 'voucher.title'
  | 'voucher.point'
  | 'voucher.reference'
  | 'voucher.amount'
  | 'voucher.expires'
  | 'voucher.clabe'
  | 'voucher.barcode'
  | 'voucher.open'
  | 'voucher.email'
  | 'form.label'
  | 'challenge.title'

export type PaymentMessages = Record<PaymentMessageKey, string>

const ES: PaymentMessages = {
  'decline.insufficient_funds': 'Tu tarjeta no tiene saldo suficiente. Prueba con otra tarjeta o paga en efectivo.',
  'decline.invalid_cvc': 'El código de seguridad no es correcto. Revísalo e intenta de nuevo.',
  'decline.invalid_expiry': 'La fecha de vencimiento no es correcta.',
  'decline.invalid_card_data': 'Revisa los datos de tu tarjeta.',
  'decline.call_issuer': 'Tu banco necesita que autorices este pago. Llama al número al reverso de tu tarjeta y vuelve a intentarlo.',
  'decline.card_disabled': 'Tu tarjeta no está activa. Actívala con tu banco o usa otra.',
  'decline.duplicate': 'Ya hiciste un pago igual hace un momento. Revisa tu correo antes de volver a pagar.',
  'decline.max_attempts': 'Llegaste al límite de intentos con esta tarjeta. Usa otra o paga en efectivo.',
  'decline.authentication_failed': 'Tu banco no pudo verificar el pago. Intenta de nuevo o usa otra tarjeta.',
  'decline.declined': 'Tu banco rechazó el pago. Usa otra tarjeta o paga en efectivo.',
  'state.loading': 'Cargando pago seguro…',
  'state.processing': 'Procesando pago…',
  'state.approved': '¡Pago aprobado!',
  'state.in_review': 'Tu pago está en revisión. Te avisamos por correo en máximo 2 días hábiles. No vuelvas a pagar.',
  'state.voucher': 'Tu ficha de pago está lista. El pedido se confirma cuando pagues.',
  'state.challenge': 'Tu banco necesita verificar el pago. Termina la verificación para continuar.',
  'state.expired': 'La ficha venció. Vuelve a armar tu carrito para pagar.',
  'state.cancelled': 'El pago se canceló. Puedes intentarlo de nuevo.',
  'state.redirect': 'Te llevamos a la página de pago…',
  'state.fallback': 'No pudimos cargar el formulario seguro de tarjeta. Puedes pagar con tarjeta en el sitio del proveedor y regresar aquí.',
  'error.network': 'No pudimos conectar. Revisa tu conexión e intenta de nuevo; no se te cobrará dos veces.',
  'error.card_data': 'Revisa los datos de tu tarjeta.',
  'error.price_mismatch': 'El total cambió. Revisa el nuevo total y vuelve a pagar.',
  'error.payment_in_progress': 'Ya hay un pago en proceso para este pedido. No vuelvas a pagar; revisa tu correo.',
  'error.expired': 'Tu apartado venció. Vuelve a armar tu carrito.',
  'error.too_many_attempts': 'Por seguridad no podemos intentar con más tarjetas. Paga en efectivo o escríbenos.',
  'error.generic': 'No pudimos procesar tu pago. Intenta de nuevo.',
  'action.retry': 'Reintentar',
  'action.try_again': 'Intentar de nuevo',
  'action.pay': 'Pagar',
  'action.cancel': 'Cancelar',
  'voucher.title': 'Ficha de pago',
  'voucher.point': 'Punto de pago',
  'voucher.reference': 'Referencia',
  'voucher.amount': 'Monto exacto',
  'voucher.expires': 'Vence el {date}',
  'voucher.clabe': 'CLABE',
  'voucher.barcode': 'Código de barras',
  'voucher.open': 'Ver o imprimir ficha',
  'voucher.email': 'También te la enviamos a tu correo.',
  'form.label': 'Datos de tu tarjeta',
  'challenge.title': 'Verificación de tu banco',
}

const EN: PaymentMessages = {
  'decline.insufficient_funds': 'Your card has insufficient funds. Try another card or pay in cash.',
  'decline.invalid_cvc': 'The security code is not correct. Check it and try again.',
  'decline.invalid_expiry': 'The expiry date is not correct.',
  'decline.invalid_card_data': 'Check your card details.',
  'decline.call_issuer': 'Your bank needs you to authorize this payment. Call the number on the back of your card and try again.',
  'decline.card_disabled': 'Your card is not active. Activate it with your bank or use another one.',
  'decline.duplicate': 'You already made the same payment a moment ago. Check your email before paying again.',
  'decline.max_attempts': 'You reached the attempt limit for this card. Use another card or pay in cash.',
  'decline.authentication_failed': 'Your bank could not verify the payment. Try again or use another card.',
  'decline.declined': 'Your bank declined the payment. Use another card or pay in cash.',
  'state.loading': 'Loading secure payment…',
  'state.processing': 'Processing payment…',
  'state.approved': 'Payment approved!',
  'state.in_review': 'Your payment is under review. We will email you within 2 business days. Do not pay again.',
  'state.voucher': 'Your payment voucher is ready. The order is confirmed once you pay.',
  'state.challenge': 'Your bank needs to verify the payment. Finish the verification to continue.',
  'state.expired': 'The voucher expired. Rebuild your cart to pay.',
  'state.cancelled': 'The payment was cancelled. You can try again.',
  'state.redirect': 'Taking you to the payment page…',
  'state.fallback': 'We could not load the secure card form. You can pay by card on the provider site and come back here.',
  'error.network': 'We could not connect. Check your connection and try again; you will not be charged twice.',
  'error.card_data': 'Check your card details.',
  'error.price_mismatch': 'The total changed. Review the new total and pay again.',
  'error.payment_in_progress': 'A payment is already in progress for this order. Do not pay again; check your email.',
  'error.expired': 'Your reservation expired. Rebuild your cart.',
  'error.too_many_attempts': 'For security we cannot try more cards. Pay in cash or contact us.',
  'error.generic': 'We could not process your payment. Please try again.',
  'action.retry': 'Retry',
  'action.try_again': 'Try again',
  'action.pay': 'Pay',
  'action.cancel': 'Cancel',
  'voucher.title': 'Payment voucher',
  'voucher.point': 'Payment point',
  'voucher.reference': 'Reference',
  'voucher.amount': 'Exact amount',
  'voucher.expires': 'Expires on {date}',
  'voucher.clabe': 'CLABE',
  'voucher.barcode': 'Barcode',
  'voucher.open': 'View or print voucher',
  'voucher.email': 'We also emailed it to you.',
  'form.label': 'Your card details',
  'challenge.title': 'Your bank verification',
}

const CATALOG: Record<PaymentLocale, PaymentMessages> = { es: ES, en: EN }

/** Catalog for a locale (`es-MX` -> es, `en-US` -> en) with the shop's per-key overrides applied. */
export function paymentMessages(locale: string | null | undefined, overrides?: Partial<PaymentMessages> | null): PaymentMessages {
  const base = CATALOG[availabilityLocale(locale)]
  if (!overrides) return base
  const out = { ...base }
  for (const [k, v] of Object.entries(overrides)) if (typeof v === 'string' && k in base) out[k as PaymentMessageKey] = v
  return out
}

const DECLINE_CODES: ReadonlySet<string> = new Set<DeclineCode>([
  'insufficient_funds',
  'invalid_cvc',
  'invalid_expiry',
  'invalid_card_data',
  'call_issuer',
  'card_disabled',
  'duplicate',
  'max_attempts',
  'authentication_failed',
  'declined',
])

/** i18n key of a decline code; unknown or missing codes map to `declined` (never a raw provider code). */
export function declineMessageKey(code: string | null | undefined): `decline.${DeclineCode}` {
  return `decline.${code && DECLINE_CODES.has(code) ? (code as DeclineCode) : 'declined'}`
}

/** Actionable text for a decline code. */
export function declineMessage(code: string | null | undefined, locale?: string | null, overrides?: Partial<PaymentMessages> | null): string {
  return paymentMessages(locale, overrides)[declineMessageKey(code)]
}

/** The value only if it is an absolute `https:` URL without credentials; `null` otherwise. */
export function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null
  try {
    const u = new URL(value)
    if (u.protocol !== 'https:' || u.username || u.password) return null
    return u.toString()
  } catch {
    return null
  }
}

/** What the UI should do with an attempt result. */
export type PaymentOutcomeKind =
  | 'approved' // paid: go to the thanks page
  | 'in_review' // pending without action: do not charge again
  | 'voucher' // cash/SPEI voucher with reference and expiry
  | 'challenge' // 3DS inside the page
  | 'redirect' // leave to the provider
  | 'rejected' // failed: show the reason and let the buyer retry
  | 'expired'
  | 'cancelled'

/** A voucher ready to render: https-only link and the amount as `Money` (or `null` when the server sent none). */
export type PaymentOutcomeVoucher = Omit<PaymentVoucher, 'amount' | 'voucher_url' | 'currency'> & {
  voucher_url: string | null
  amount: Money | null
}

const NEXT_STEP: Record<DeclineCode, PaymentNextStep> = {
  insufficient_funds: 'use_other_card',
  invalid_cvc: 'fix_card_data',
  invalid_expiry: 'fix_card_data',
  invalid_card_data: 'fix_card_data',
  call_issuer: 'contact_issuer',
  card_disabled: 'use_other_card',
  duplicate: 'check_email',
  max_attempts: 'use_other_card',
  authentication_failed: 'retry',
  declined: 'use_other_card',
}

function voucherMoney(v: PaymentVoucher): Money | null {
  const a = v.amount
  if (a && typeof a === 'object' && typeof a.amount === 'string') return a
  const text = typeof a === 'number' ? String(a) : typeof a === 'string' ? a : ''
  if (!text || !/^\d+(\.\d+)?$/.test(text) || !v.currency) return null
  return { amount: text.includes('.') ? text : `${text}.00`, currency_code: v.currency }
}

export type PaymentOutcome = {
  kind: PaymentOutcomeKind
  /** Text for the buyer (no codes). */
  message: string
  decline_code: DeclineCode | null
  /** `true` when the buyer can try again with the checkout still open. */
  retryable: boolean
  /** https-only. */
  redirect_url: string | null
  challenge: { url: string | null; creq: string | null } | null
  voucher: PaymentOutcomeVoucher | null
  attempts_left: number | null
  /** What to do next (server value, or derived from the decline code): fix the card, use another, rebuild the cart... */
  next_step: PaymentNextStep | null
}

/**
 * Classifies an attempt result. Unknown statuses are treated as `in_review`
 * (never as approved, never as a reason to charge again).
 */
export function paymentOutcome(result: PaymentAttemptResult, locale?: string | null, overrides?: Partial<PaymentMessages> | null): PaymentOutcome {
  const m = paymentMessages(locale, overrides)
  const p = result.payment
  const action: PaymentAction | null = p.action ?? null
  const base = {
    decline_code: null as DeclineCode | null,
    retryable: false,
    redirect_url: null as string | null,
    challenge: null as PaymentOutcome['challenge'],
    voucher: null as PaymentOutcome['voucher'],
    attempts_left: typeof result.attempts_left === 'number' ? result.attempts_left : null,
    next_step: (p.next_step ?? null) as PaymentNextStep | null,
  }
  const out = (kind: PaymentOutcomeKind, message: string, extra: Partial<PaymentOutcome> = {}): PaymentOutcome => ({ ...base, kind, message, ...extra })

  if (p.status === 'paid') return out('approved', m['state.approved'])
  if (p.status === 'failed') {
    const code = p.decline_code ?? 'declined'
    const known: DeclineCode = DECLINE_CODES.has(code) ? code : 'declined'
    return out('rejected', m[declineMessageKey(code)], {
      decline_code: known,
      next_step: p.next_step ?? NEXT_STEP[known],
      retryable: p.retryable !== false && base.attempts_left !== 0,
    })
  }
  if (p.status === 'expired') return out('expired', m['state.expired'], { next_step: 'rebuild_cart' })
  if (p.status === 'cancelled') return out('cancelled', m['state.cancelled'], { retryable: true, next_step: 'rebuild_cart' })

  if (action?.type === 'redirect') {
    const url = safeHttpsUrl(action.redirect_url)
    if (url) return out('redirect', m['state.redirect'], { redirect_url: url })
  }
  if (p.status === 'requires_action' || p.status === 'pending') {
    if (action?.type === 'voucher' && action.voucher) {
      const { amount: _a, currency: _c, voucher_url, ...rest } = action.voucher
      return out('voucher', m['state.voucher'], {
        next_step: 'pay_cash',
        voucher: { ...rest, voucher_url: safeHttpsUrl(voucher_url), amount: voucherMoney(action.voucher) },
      })
    }
    if (action?.type === 'challenge' && action.challenge) {
      return out('challenge', m['state.challenge'], {
        challenge: { url: safeHttpsUrl(action.challenge.url), creq: typeof action.challenge.creq === 'string' ? action.challenge.creq : null },
      })
    }
  }
  return out('in_review', m['state.in_review'])
}

/** Failures of `POST /payment` the form maps to a specific text and next step. */
export type PaymentErrorKind =
  | 'network' // no answer: retry with the SAME attempt (idempotent)
  | 'price_mismatch' // total changed: show it, remount, pay again with a NEW attempt
  | 'payment_in_progress' // 409 payment_in_progress: another attempt is paid/pending: do not retry
  | 'expired' // 409: reservation expired
  | 'too_many_attempts' // 429
  | 'generic'

export type PaymentErrorView = { kind: PaymentErrorKind; message: string; retrySameAttempt: boolean; canRetry: boolean }

/**
 * Maps a transport error (a `StorefrontError` or anything with `status`/`code`)
 * to a view. Network failures and 502/503/504 are safe to retry with the same
 * idempotency key; 409/422/429 are answers, not outages.
 */
export function paymentErrorView(err: unknown, locale?: string | null, overrides?: Partial<PaymentMessages> | null): PaymentErrorView {
  const m = paymentMessages(locale, overrides)
  const e = (err ?? {}) as Partial<StorefrontError> & { status?: number; code?: string }
  const status = typeof e.status === 'number' ? e.status : 0
  const code = typeof e.code === 'string' ? e.code : ''
  if (code === 'price_mismatch') {
    return { kind: 'price_mismatch', message: m['error.price_mismatch'], retrySameAttempt: false, canRetry: true }
  }
  if (status === 409 && code === 'expired') return { kind: 'expired', message: m['error.expired'], retrySameAttempt: false, canRetry: false }
  if (status === 409 && code === 'payment_in_progress') {
    return { kind: 'payment_in_progress', message: m['error.payment_in_progress'], retrySameAttempt: false, canRetry: false }
  }
  // 409 conflict: that Idempotency-Key was already used with a DIFFERENT payment (e.g. a new card after a reload).
  // Not an outage and not "in progress": start a new attempt.
  if (status === 409) return { kind: 'generic', message: m['error.generic'], retrySameAttempt: false, canRetry: true }
  if (status === 429 || code === 'too_many_attempts') {
    return { kind: 'too_many_attempts', message: m['error.too_many_attempts'], retrySameAttempt: false, canRetry: false }
  }
  // What OPS declared wins over the status: `retryable:false` is an answer (generic), any other 5xx (also a 500 with no readable body) is an outage whose charge may have happened: same key.
  const declared = (e as { retryable?: unknown }).retryable
  if (status >= 500 && declared === false) return { kind: 'generic', message: m['error.generic'], retrySameAttempt: false, canRetry: true }
  if (status === 0 || status === 502 || status === 503 || status === 504 || code === 'network' || code === 'timeout' || status >= 500) {
    return { kind: 'network', message: m['error.network'], retrySameAttempt: true, canRetry: true }
  }
  return { kind: 'generic', message: m['error.generic'], retrySameAttempt: false, canRetry: true }
}

/** `Vence el 5 de noviembre de 2026, 18:00` style text for a voucher deadline; `null` when absent or invalid. */
export function formatVoucherExpiry(expiresAt: string | null | undefined, locale?: string | null, overrides?: Partial<PaymentMessages> | null): string | null {
  if (!expiresAt) return null
  const d = new Date(expiresAt)
  if (Number.isNaN(d.getTime())) return null
  let date: string
  try {
    date = new Intl.DateTimeFormat(locale ?? undefined, { dateStyle: 'long', timeStyle: 'short' }).format(d)
  } catch {
    date = d.toISOString()
  }
  return formatAvailabilityMessage(paymentMessages(locale, overrides)['voucher.expires'], { date })
}

/** Builds an idempotency key for a payment attempt: the same attempt always yields the same key. */
export function paymentIdempotencyKey(checkoutId: string, attempt: string): string {
  return `pay-${checkoutId}-${attempt}`
}
