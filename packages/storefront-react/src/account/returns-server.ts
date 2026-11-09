/**
 * Server side of the return form (`@asteby/storefront-react/account/server`): `createReturnRequestAction`. No React, no
 * router: Web `Request` only, so any framework mounts it.
 *
 * The browser never talks to OPS and never sees the buyer's token: the action reads it with `readCustomerToken`, loads the
 * order (which also proves it is the buyer's own), validates the form against that order and calls
 * `customer.requestReturn` with a stable `Idempotency-Key`, so a double submit or a refresh of the POST does not open a
 * second return. Answers carry codes (`ReturnErrorCode`), never a server message; nothing is logged here.
 */
import {
  RETURN_NOTES_MAX,
  isReturnReason,
  isStorefrontError,
  returnEligibility,
  returnableLines,
  type Order,
  type ReturnEligibilityOptions,
  type ReturnReason,
  type ReturnRequestInput,
  type StorefrontClient,
} from '@asteby/storefront'
import { RETURN_FORM } from './returns-form-names.js'
import type { ReturnErrorCode, ReturnFieldErrorCode, ReturnFormValues, ReturnRequestActionData } from './returns-types.js'

export type { ReturnErrorCode, ReturnFieldErrorCode, ReturnFormValues, ReturnIntent, ReturnRequestActionData } from './returns-types.js'

export type CreateReturnRequestActionOptions = {
  storefront: StorefrontClient
  /** Returns the buyer's session token (read it from the store's cookie), or `null` for a guest. */
  readCustomerToken: (request: Request) => string | null | undefined | Promise<string | null | undefined>
  /** Shopper IP for the per-shopper rate limit (see `clientIp` of the client). */
  clientIp?: (request: Request) => string | null | undefined
  /**
   * The store's policy, checked against the order BEFORE calling the API (`returnEligibility`). Without it only the
   * stage is checked (delivered, not cancelled/refunded); the API enforces the rest.
   */
  eligibility?: Omit<ReturnEligibilityOptions, 'now'>
  /** Clock for the window check, for tests. */
  now?: () => Date
  /** Rejects cross-site posts (default `true`): `Origin` and `Sec-Fetch-Site` must match the site. */
  sameSiteOnly?: boolean
}


const INTENT = 'request-return' as const

const fail = (code: ReturnErrorCode, extra: { fieldErrors?: Record<string, ReturnFieldErrorCode>; values?: ReturnFormValues } = {}): ReturnRequestActionData => ({
  ok: false,
  intent: INTENT,
  error: { code },
  ...(extra.fieldErrors && Object.keys(extra.fieldErrors).length ? { fieldErrors: extra.fieldErrors } : {}),
  ...(extra.values ? { values: extra.values } : {}),
})

function sameSite(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'same-site' && site !== 'none') return false
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host
    return new URL(origin).host === host.split(',')[0]!.trim()
  } catch {
    return false
  }
}

const text = (form: FormData, name: string): string => {
  const v = form.get(name)
  return typeof v === 'string' ? v : ''
}

/** At most this many form rows are read (an order cannot have more lines than this). */
const MAX_ROWS = 200

export type ParsedReturnForm = { input: ReturnRequestInput; values: ReturnFormValues } | { fieldErrors: Record<string, ReturnFieldErrorCode>; values: ReturnFormValues }

/**
 * Reads and validates the form against the order. Pure: exported to test and to reuse in a custom action.
 * Rules: at least one line; each chosen SKU must be one of the order's returnable lines; quantity a whole number in
 * `1..max`; reason one of the four the API accepts (empty reads as the default, `not_wanted`); notes at most 500
 * characters (counted as the API does, in characters, after trimming).
 */
export function parseReturnForm(form: FormData, order: Pick<Order, 'lines'>, options: { allowedReasons?: readonly ReturnReason[] } = {}): ParsedReturnForm {
  const returnable = new Map(returnableLines(order).map((l) => [l.sku, l]))
  const fieldErrors: Record<string, ReturnFieldErrorCode> = {}
  const lines: ReturnRequestInput['lines'] = []
  const echo: Record<string, number> = {}
  const seen = new Set<string>()

  for (let i = 0; i < MAX_ROWS; i++) {
    const sku = text(form, RETURN_FORM.sku(i)).trim()
    if (!sku) {
      // Rows are contiguous: the first gap ends the list.
      if (!form.has(RETURN_FORM.selected(i)) && !form.has(RETURN_FORM.quantity(i))) break
      continue
    }
    if (!form.get(RETURN_FORM.selected(i))) continue
    const line = returnable.get(sku)
    const raw = text(form, RETURN_FORM.quantity(i)).trim()
    const qty = /^\d{1,6}$/.test(raw) ? Number(raw) : Number.NaN
    if (seen.has(sku)) {
      fieldErrors[`lines.${i}`] = 'invalid'
      continue
    }
    seen.add(sku)
    if (Number.isFinite(qty)) echo[sku] = qty
    if (!line) {
      fieldErrors[`lines.${i}`] = 'invalid'
      continue
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > line.maxQuantity) {
      fieldErrors[`lines.${i}`] = 'invalid_quantity'
      continue
    }
    lines.push({ sku, quantity: qty })
  }
  if (lines.length === 0 && Object.keys(fieldErrors).length === 0) fieldErrors.lines = 'lines_required'

  const rawReason = text(form, RETURN_FORM.reason).trim()
  const allowed = options.allowedReasons
  let reason: ReturnReason | undefined
  if (rawReason) {
    if (isReturnReason(rawReason) && (!allowed || allowed.includes(rawReason))) reason = rawReason
    else fieldErrors.reason = 'invalid_reason'
  }
  const notes = text(form, RETURN_FORM.notes).replace(/\r\n/g, '\n').trim()
  // Characters as a person counts them (a code point), not UTF-16 units.
  if ([...notes].length > RETURN_NOTES_MAX) fieldErrors.notes = 'notes_too_long'

  const values: ReturnFormValues = { lines: echo, reason: rawReason, notes }
  if (Object.keys(fieldErrors).length) return { fieldErrors, values }
  return { input: { lines, ...(reason ? { reason } : {}), ...(notes ? { notes } : {}) }, values }
}

/** `return-<sha256>` of (order, lines by SKU, reason, notes): the same request is the same key, a different one is not. */
export async function returnIdempotencyKey(orderId: string, input: ReturnRequestInput): Promise<string> {
  const lines = [...input.lines].sort((a, b) => (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0)).map((l) => [l.sku, l.quantity])
  const payload = JSON.stringify([orderId, lines, input.reason ?? '', input.notes ?? ''])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return `return-${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

const FIELD_OF: Record<string, string> = { reason: 'reason', notes: 'notes', lines: 'lines' }

function toFailure(err: unknown, values: ReturnFormValues): ReturnRequestActionData {
  if (!isStorefrontError(err)) return fail('unavailable', { values })
  if (err.code === 'insufficient_scope') return fail('store_misconfigured', { values })
  switch (err.status) {
    case 401:
      return fail('unauthorized', { values })
    case 404:
      return fail('not_found', { values })
    case 409:
      return fail('not_returnable', { values })
    case 400:
    case 422: {
      const field = FIELD_OF[(err.field ?? '').split(/[.[]/)[0]!]
      return fail('validation', { values, ...(field ? { fieldErrors: { [field]: field === 'reason' ? 'invalid_reason' : field === 'notes' ? 'notes_too_long' : 'invalid' } } : {}) })
    }
    case 429:
      return fail('rate_limited', { values })
    default:
      return fail('unavailable', { values })
  }
}

/**
 * The return action: one `POST` form (`<ReturnRequestForm>`) with `intent=request-return` and `order_id`.
 *
 * It never redirects: it returns a `ReturnRequestActionData` for the page to render (`<ReturnRequestForm data={...}>`).
 * Re-posting the same form is safe: the `Idempotency-Key` is derived from the request.
 *
 * ```ts
 * export const action = createReturnRequestAction({ storefront, readCustomerToken: (req) => readToken(req) })
 * ```
 */
export function createReturnRequestAction(options: CreateReturnRequestActionOptions) {
  const { storefront: sf } = options

  return async function returnRequestAction({ request }: { request: Request }): Promise<ReturnRequestActionData> {
    if (options.sameSiteOnly !== false && !sameSite(request)) return fail('unavailable')
    const form = await request.formData().catch(() => null)
    if (!form || text(form, RETURN_FORM.intent) !== INTENT) return fail('validation')
    const orderId = text(form, RETURN_FORM.orderId).trim()
    if (!orderId || orderId.length > 128) return fail('not_found')

    const token = (await options.readCustomerToken(request)) || null
    if (!token) return fail('unauthorized')
    const ip = options.clientIp?.(request)
    const w = { customerToken: token, ...(ip ? { clientIp: ip } : {}) }

    let values: ReturnFormValues = { lines: {}, reason: text(form, RETURN_FORM.reason).trim(), notes: text(form, RETURN_FORM.notes).trim() }
    try {
      const order = await sf.customer.order(orderId, w)
      if (!order) return fail('not_found')
      const eligibility = returnEligibility(order, { ...options.eligibility, ...(options.now ? { now: options.now() } : {}) })
      if (!eligibility.eligible) return fail('not_returnable')

      const parsed = parseReturnForm(form, order, eligibility.warrantyOnly ? { allowedReasons: ['warranty'] } : {})
      values = parsed.values
      if ('fieldErrors' in parsed) return fail('validation', { fieldErrors: parsed.fieldErrors, values })

      const request_ = await sf.customer.requestReturn(orderId, parsed.input, { ...w, idempotencyKey: await returnIdempotencyKey(orderId, parsed.input) })
      return { ok: true, intent: INTENT, orderId, request: request_ }
    } catch (err) {
      return toFailure(err, values)
    }
  }
}

export type ReturnRequestAction = ReturnType<typeof createReturnRequestAction>
