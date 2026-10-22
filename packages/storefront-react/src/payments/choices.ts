/**
 * "Payment method" rows for a hybrid checkout: pure functions, no DOM and no server, so the loader, the action and the
 * browser share them.
 *
 * Rules (embedded-payment contract 1.2):
 * - Rows come ONLY from what the server publishes (`payment-methods[].options` and `.client`). No provider names and no
 *   amounts live here.
 * - Card and cash are paid in the page; `wallet` and `credits` redirect to the provider.
 * - Without `client`, or with the card flagged `redirect: true`, the server does not offer `embedded`: the shop falls
 *   back to the usual redirect flow.
 */
import type {
  CheckoutResult,
  PaymentAttemptResult,
  PaymentClient,
  PaymentMethod,
  PaymentOption,
  PaymentOptionKey,
  PaymentPoint,
} from '@asteby/storefront'

/** One row of "Payment method". `value` is what travels in the form (`payment_choice`). */
export type PayChoice = {
  value: string
  /** Server method key (`payment_method` of the checkout). */
  methodKey: string
  /** Provider option; `null` for a method without options (the plain flow). */
  option: PaymentOptionKey | null
  /** `card` (form in the page), `cash` (voucher), `redirect` (leaves to the gateway) or `plain`. */
  mode: 'card' | 'cash' | 'redirect' | 'plain'
  /** The provider's own text (`option.label`); the shop supplies its own when missing. */
  label: string | null
  points: PaymentPoint[]
  maxInstallments: number | null
}

export type PayChoices = {
  choices: PayChoice[]
  /** Public data to mount the card form; `null` when the server does not offer `embedded`. */
  cardClient: PaymentClient | null
  defaultValue: string | null
}

export type BuildPayChoicesOptions = {
  /** Method keys this shop never offers even when the server publishes them (e.g. a manual transfer). */
  hide?: Iterable<string>
}

const SEP = '|'

export function choiceValue(methodKey: string, option: PaymentOptionKey | null): string {
  return option ? `${methodKey}${SEP}${option}` : methodKey
}

/** `"mercadopago|card"` becomes method and option. A value without `|` is a method without options. */
export function parseChoice(value: string | null | undefined): { methodKey: string; option: PaymentOptionKey | null } | null {
  const raw = (value ?? '').trim()
  if (!raw) return null
  const i = raw.lastIndexOf(SEP)
  if (i === -1) return { methodKey: raw, option: null }
  const option = raw.slice(i + 1)
  if (option !== 'card' && option !== 'cash' && option !== 'wallet' && option !== 'credits') return null
  return { methodKey: raw.slice(0, i), option }
}

function modeOf(option: PaymentOption): PayChoice['mode'] {
  if (option.redirect || option.key === 'wallet' || option.key === 'credits') return 'redirect'
  return option.key === 'cash' ? 'cash' : 'card'
}

/**
 * Rows from `GET payment-methods`. A method with `options` unfolds into one row per option (server order); one without
 * is a single plain row. `cardClient` only exists when the card is paid in the page.
 */
export function buildPayChoices(methods: readonly PaymentMethod[], options: BuildPayChoicesOptions = {}): PayChoices {
  const hidden = new Set(options.hide ?? [])
  const choices: PayChoice[] = []
  let cardClient: PaymentClient | null = null
  let defaultValue: string | null = null
  for (const method of methods) {
    if (hidden.has(method.key)) continue
    const opts = method.options ?? []
    if (opts.length === 0) {
      const value = choiceValue(method.key, null)
      choices.push({ value, methodKey: method.key, option: null, mode: 'plain', label: null, points: [], maxInstallments: null })
      if (method.default && !defaultValue) defaultValue = value
      continue
    }
    opts.forEach((option, i) => {
      const mode = modeOf(option)
      const value = choiceValue(method.key, option.key)
      choices.push({
        value,
        methodKey: method.key,
        option: option.key,
        mode,
        label: option.label?.trim() || null,
        points: option.key === 'cash' ? (option.points ?? []) : [],
        maxInstallments: option.max_installments ?? null,
      })
      if (mode === 'card' && method.client && !cardClient) cardClient = method.client
      if (method.default && i === 0 && !defaultValue) defaultValue = value
    })
  }
  // A card meant for the page but without `client` cannot be mounted: it is paid by redirect.
  const usable = choices.map((c) => (c.mode === 'card' && !cardClient ? { ...c, mode: 'redirect' as const } : c))
  return { choices: usable, cardClient, defaultValue: defaultValue ?? usable[0]?.value ?? null }
}

/** Chosen cash point becomes the cash `provider_data`, built on the server from the provider's list. */
export function cashProviderData(points: readonly PaymentPoint[], pointId: string | null | undefined): Record<string, string> | null {
  const point = points.find((p) => p.id === pointId) ?? (pointId ? null : points[0])
  if (!point) return null
  return {
    payment_method_id: point.payment_method_id,
    ...(point.payment_point ? { payment_point: point.payment_point } : {}),
  }
}

/**
 * A checkout (`GET checkouts/:id`) as an attempt result, for polling a 3DS challenge or a payment under review.
 * It only translates server states: it never decides a payment.
 */
export function checkoutToAttempt(result: CheckoutResult): PaymentAttemptResult {
  const { checkout, payment, order } = result
  const action = payment.action ?? null
  const base = { checkout, ...(order ? { order } : {}) }
  const status = (checkout.status ?? '').toLowerCase()
  if (status === 'paid' || status === 'converted') return { ...base, payment: { provider: payment.provider, status: 'paid', outcome: 'approved' } }
  if (status === 'cancelled' || status === 'canceled') return { ...base, payment: { provider: payment.provider, status: 'cancelled' } }
  if (status === 'expired') return { ...base, payment: { provider: payment.provider, status: 'expired' } }
  if (status === 'failed') {
    const decline = (payment as { decline_code?: PaymentAttemptResult['payment']['decline_code'] }).decline_code ?? 'declined'
    return { ...base, payment: { provider: payment.provider, status: 'failed', outcome: 'rejected', decline_code: decline, retryable: true } }
  }
  // Still pending: same as the last attempt left it (challenge or review), so the screen does not change.
  if (action?.type === 'challenge') return { ...base, payment: { provider: payment.provider, status: 'requires_action', outcome: 'challenge', action } }
  return { ...base, payment: { provider: payment.provider, status: 'pending', outcome: 'pending', action: action ?? { type: 'none' } } }
}

/** Body `{ error: { code, message, details } }` that `createFetchTransport` understands. */
export type PayErrorBody = { error: { code: string; message: string; details?: unknown } }

type ErrorLike = { status?: number; code?: string; field?: string; message?: string; details?: unknown }

/**
 * Server error becomes a JSON response for the browser. Keeps the codes the SDK knows how to read (`price_mismatch`,
 * `payment_in_progress`, `expired`, `too_many_attempts`); the mock sends "in progress" in `field`, so that is checked too.
 */
export function payErrorResponse(err: ErrorLike): { status: number; body: PayErrorBody } {
  const status = typeof err.status === 'number' && err.status >= 400 ? err.status : 503
  let code = err.code ?? 'server_error'
  if (status === 409 && err.field === 'payment_in_progress') code = 'payment_in_progress'
  if (status === 429) code = 'too_many_attempts'
  if (status === 422 && err.field === 'expected_total') code = 'price_mismatch'
  return { status, body: { error: { code, message: err.message ?? '', ...(err.details !== undefined ? { details: err.details } : {}) } } }
}

export type VoucherRowLabels = { point: string; reference: string; clabe: string; barcode: string; expires: string }

/** Cookie receipt rows for a payment under review or with a voucher (shown on the thank-you page). */
export function voucherRows(
  voucher: NonNullable<NonNullable<PaymentAttemptResult['payment']['action']>['voucher']> | null | undefined,
  labels: VoucherRowLabels,
  locale: string,
): [label: string, value: string][] {
  if (!voucher) return []
  const rows: [string, string][] = []
  if (voucher.payment_point) rows.push([labels.point, String(voucher.payment_point).slice(0, 60)])
  if (voucher.reference) rows.push([labels.reference, String(voucher.reference).slice(0, 80)])
  if (voucher.clabe) rows.push([labels.clabe, String(voucher.clabe).slice(0, 40)])
  if (voucher.barcode) rows.push([labels.barcode, String(voucher.barcode).slice(0, 80)])
  if (voucher.expires_at) {
    const d = new Date(voucher.expires_at)
    if (!Number.isNaN(d.getTime())) {
      rows.push([labels.expires, new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(d) + ' UTC'])
    }
  }
  return rows
}
