/**
 * Server side of the embedded payment (`@asteby/storefront-react/payments/server`): the two JSON resource routes the
 * browser talks to (charge the card, re-read the payment) and the cash voucher of the page form. No React, no router:
 * Web `Request`/`Response` only, so any framework mounts it.
 *
 * The browser NEVER calls OPS. These handlers translate to `carts.checkout` + `checkouts.pay` with the shop's `sk_` token.
 *
 * Money: no amount is computed here. `expected_total` is the total the server showed the buyer (echoed back by the SDK);
 * OPS compares it with the order and answers `422 price_mismatch` when it changed.
 *
 * Everything shop-specific (cookies, receipt shape, which fields the form requires, how contact/delivery are saved)
 * arrives through `EmbeddedPayConfig` callbacks.
 */
import {
  isStorefrontError,
  paymentIdempotencyKey,
  paymentOutcome,
  safeHttpsUrl,
  type Cart,
  type CheckoutResult,
  type Money,
  type PaymentAttemptResult,
  type StorefrontClient,
} from '@asteby/storefront'
import { buildPayChoices, cashProviderData, checkoutToAttempt, parseChoice, payErrorResponse, type PayChoice } from './choices.js'

export * from './choices.js'
export { paymentCsp, paymentCspHeaderName, paymentCspHeaders, paymentCspMode, paymentNonce, paymentNonceFromHeaders } from './csp.js'
export type { PaymentCspMode, PaymentCspOptions } from './csp.js'

export type RateLimiter = { hit(key: string, now?: number): { allowed: boolean; retryAfterSec: number } }

/** In-memory sliding window per key. Protects this process; OPS puts its own cap per checkout on top. */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }): RateLimiter {
  const hits = new Map<string, number[]>()
  return {
    hit(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
      if (recent.length >= limit) {
        hits.set(key, recent)
        return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((recent[0]! + windowMs - now) / 1000)) }
      }
      recent.push(now)
      hits.set(key, recent)
      if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k)
      return { allowed: true, retryAfterSec: 0 }
    },
  }
}

/** Buyer IP as forwarded by a trusted proxy/CDN; without `trustProxy` a single shared key. */
export function clientKey(request: Request, trustProxy = false): string {
  if (!trustProxy) return 'direct'
  const cf = request.headers.get('cf-connecting-ip')
  if (cf) return cf.trim()
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'direct'
}

/**
 * A request from another site cannot pay with the buyer's cookie. Only the HOST is compared (no scheme or port): behind
 * the proxy the request scheme can be http while the browser sent https.
 */
export function sameOrigin(request: Request, site: string): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    const host = new URL(origin).hostname
    return host === new URL(site).hostname || host === new URL(request.url).hostname
  } catch {
    return false
  }
}

/** Device fingerprint (anti-fraud): OPTIONAL, so it never breaks a payment. Anything over 200 chars or odd is dropped. */
export const DEVICE_SESSION_ID_MAX = 200
export function deviceSessionId(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const id = v.trim()
  return id.length > 0 && id.length <= DEVICE_SESSION_ID_MAX && /^[\w.:-]+$/.test(id) ? id : undefined
}

const ATTEMPT = /^[A-Za-z0-9_-]{8,100}$/

const asMoney = (v: unknown): Money | null => {
  const m = v as Partial<Money> | null
  return m && typeof m.amount === 'string' && /^\d+(\.\d+)?$/.test(m.amount) && typeof m.currency_code === 'string' && m.currency_code.length === 3
    ? { amount: m.amount, currency_code: m.currency_code }
    : null
}

/** What the shop keeps between the checkout creation and the end of the payment (usually in a cookie). */
export type PaySession<TDraft extends { checkout_id?: string }> = { cart_id: string; draft: TDraft }

export type EmbeddedPayMessages = {
  /** Required form fields missing. */
  fillFields: string
  /** The cart cookie is gone or the checkout expired. */
  expiredCart: string
  /** The chosen row is not payable in the page (the server decides, not the browser). */
  methodUnavailable: string
  tooManyRequests: string
  cashChoosePoint: string
}

const DEFAULT_MESSAGES: EmbeddedPayMessages = {
  fillFields: 'Completa los campos marcados.',
  expiredCart: 'Tu carrito venció. Vuelve a armarlo para pagar.',
  methodUnavailable: 'Esta forma de pago no está disponible por ahora.',
  tooManyRequests: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  cashChoosePoint: 'Elige dónde pagar en efectivo.',
}

export type EmbeddedPayConfig<TDraft extends { checkout_id?: string }> = {
  /** The store client with the `sk_` token for this request. */
  client: (request: Request) => Promise<StorefrontClient>
  /** Public origin of the shop (`https://tienda.com`). Used for `return_url` and the origin check. */
  site: (request: Request) => string
  /** Path of the thank-you page, appended to `site`. */
  returnPath: string
  /** Locale for the outcome texts and voucher dates. Default `es-MX`. */
  locale?: string
  readCartId: (request: Request) => Promise<string | null>
  readSession: (request: Request) => Promise<PaySession<TDraft> | null>
  /** `Set-Cookie` value that keeps the session so a retry reuses the already created checkout. */
  serializeSession: (session: PaySession<TDraft>) => Promise<string>
  /** `null` when the form is complete; otherwise the message to show (HTTP 400). The shop knows its required fields. */
  validateFields: (fields: Record<string, string>) => string | null
  /** Saves contact, address and delivery on the server cart (the cart becomes an order at checkout, so do it before). */
  prepareCart: (args: { sf: StorefrontClient; cartId: string; fields: Record<string, string> }) => Promise<void>
  /** First draft of the receipt from the created checkout and the cart as it was before. */
  createDraft: (args: { created: CheckoutResult; before: Cart | null; fields: Record<string, string> }) => TDraft
  /**
   * Called after every attempt. When the order is closed (approved, under review, voucher) append the receipt cookie and
   * clear the cart/session cookies to `headers` and return `true`; otherwise return `false` (the session is kept).
   */
  settle: (args: { draft: TDraft; result: PaymentAttemptResult; headers: Headers }) => Promise<boolean>
  /** Method keys the shop never offers (the server also checks them: a forged `payment_choice` is refused). */
  hide?: Iterable<string>
  messages?: Partial<EmbeddedPayMessages>
  /** Per-IP limit on charges. Default 10 per 10 minutes; `false` disables (OPS still caps attempts per checkout). */
  rateLimit?: RateLimiter | { limit?: number; windowMs?: number } | false
  /** Trust `cf-connecting-ip` / `x-forwarded-for` for the limiter key. */
  trustProxy?: boolean
  /** Cache header of every response. Default `private, no-store`. */
  cacheControl?: string
  /** Diagnostic log of an OPS rejection (no bodies, no buyer data). Default: one JSON line with `console.warn`. */
  log?: (entry: { level: 'warn'; msg: string; status: number; code: string | null; field: string | null; message: string }) => void
}

export type CashOutcome = { kind: 'done'; headers: Headers } | { kind: 'error'; status: number; message: string; fields: string[] }

export type EmbeddedPayHandlers = {
  /** POST JSON from the card form: creates the checkout (idempotent per cart) and charges the attempt. */
  pay: (request: Request) => Promise<Response>
  /** POST: re-reads the checkout (3DS challenge, "under review") in the shape of an attempt. */
  status: (request: Request) => Promise<Response>
  /** Cash from the page form (with or without JavaScript): creates the `embedded/cash` checkout and asks for the voucher. */
  cash: (args: { sf: StorefrontClient; request: Request; cartId: string; fields: Record<string, string>; choice: PayChoice; before: Cart | null }) => Promise<CashOutcome>
}

export function createEmbeddedPayHandlers<TDraft extends { checkout_id?: string }>(config: EmbeddedPayConfig<TDraft>): EmbeddedPayHandlers {
  const msg = { ...DEFAULT_MESSAGES, ...config.messages }
  const locale = config.locale ?? 'es-MX'
  const cache = config.cacheControl ?? 'private, no-store'
  const makeLimiter = (): RateLimiter | null => {
    const r = config.rateLimit
    if (r === false) return null
    if (r && 'hit' in r) return r
    return createRateLimiter({ limit: Math.max(1, r?.limit ?? 10), windowMs: r?.windowMs ?? 10 * 60_000 })
  }
  const limiter = makeLimiter()
  const log =
    config.log ??
    ((entry) => {
      console.warn(JSON.stringify(entry))
    })

  const json = (body: unknown, init: { status?: number; headers?: Headers | Record<string, string> } = {}) => {
    const headers = new Headers(init.headers)
    headers.set('Cache-Control', cache)
    headers.set('Content-Type', 'application/json')
    return new Response(JSON.stringify(body), { status: init.status ?? 200, headers })
  }
  const fail = (status: number, code: string, message: string, extra: Headers | Record<string, string> = {}) => json({ error: { code, message } }, { status, headers: extra })

  async function pay(request: Request): Promise<Response> {
    const site = config.site(request)
    if (!sameOrigin(request, site)) return fail(403, 'forbidden', 'origin')
    if (limiter) {
      const gate = limiter.hit(clientKey(request, config.trustProxy))
      if (!gate.allowed) return fail(429, 'too_many_attempts', msg.tooManyRequests, { 'Retry-After': String(gate.retryAfterSec) })
    }
    const cartId = await config.readCartId(request)
    if (!cartId) return fail(409, 'expired', msg.expiredCart)

    let body: { option?: unknown; attempt?: unknown; provider_data?: unknown; device_session_id?: unknown; expected_total?: unknown; fields?: unknown }
    try {
      body = (await request.json()) as typeof body
    } catch {
      return fail(400, 'validation', msg.fillFields)
    }
    const attempt = typeof body.attempt === 'string' && ATTEMPT.test(body.attempt) ? body.attempt : null
    const expected = asMoney(body.expected_total)
    const data = body.provider_data
    if (body.option !== 'card' || !attempt || !expected || !data || typeof data !== 'object' || Array.isArray(data)) {
      return fail(400, 'validation', msg.fillFields)
    }
    // The amount does not travel in `provider_data`: OPS sets it. Even if the browser (or a stray script) sends one, it is not forwarded.
    const { transaction_amount: _ignored, ...providerData } = data as Record<string, unknown>
    const fields: Record<string, string> = {}
    for (const [k, v] of Object.entries((body.fields ?? {}) as Record<string, unknown>)) if (typeof v === 'string') fields[k] = v.trim()
    const invalid = config.validateFields(fields)
    if (invalid) return fail(400, 'validation', invalid)

    const sf = await config.client(request)
    const choice = parseChoice(fields.payment_choice)
    let session: PaySession<TDraft> | undefined
    try {
      // The server decides what can be paid in the page: the browser only picks among what OPS published.
      const methods = await sf.carts.paymentMethods(cartId)
      const card = buildPayChoices(methods.methods, config.hide ? { hide: config.hide } : {}).choices.find((c) => c.mode === 'card' && c.value === fields.payment_choice)
      if (!choice || !card) return fail(422, 'invalid_state', msg.methodUnavailable)

      // A retry (the first charge failed or the network dropped) reuses the checkout already created: the cart is an
      // order by now and cannot be edited again. Only the attempt (the payment key) changes.
      const previous = await config.readSession(request)
      const reusedId = previous && previous.cart_id === cartId ? previous.draft.checkout_id : undefined
      let checkoutId: string
      if (previous && reusedId) {
        session = previous
        checkoutId = reusedId
      } else {
        await config.prepareCart({ sf, cartId, fields })
        const before = await sf.carts.get(cartId).catch(() => null)
        const created = await sf.carts.checkout(
          cartId,
          { payment_method: card.methodKey, payment_flow: 'embedded', payment_option: 'card', expected_total: expected, return_url: `${site}${config.returnPath}` },
          { idempotencyKey: `chk-${cartId}` },
        )
        checkoutId = created.checkout.id
        session = { cart_id: cartId, draft: config.createDraft({ created, before, fields }) }
      }

      const device = deviceSessionId(body.device_session_id)
      const result = await sf.checkouts.pay(
        checkoutId,
        { method: 'card', provider_data: providerData, ...(device ? { device_session_id: device } : {}), expected_total: expected },
        { idempotencyKey: paymentIdempotencyKey(checkoutId, attempt) },
      )

      const headers = new Headers()
      const closed = await config.settle({ draft: session.draft, result, headers })
      if (!closed) headers.append('Set-Cookie', await config.serializeSession(session))
      return json(result, { headers })
    } catch (err) {
      if (isStorefrontError(err)) {
        const { status, body: errBody } = payErrorResponse(err)
        log({ level: 'warn', msg: 'cobro rechazado por OPS', status: err.status, code: err.code ?? null, field: err.field ?? null, message: String(err.message).slice(0, 300) })
        // 5xx, network or timeout: the charge may have happened; the browser retries with the SAME key.
        // The checkout exists even when the charge fails: kept so the retry reuses it.
        const headers = new Headers()
        if (session) headers.append('Set-Cookie', await config.serializeSession(session))
        return json(errBody, { status, headers })
      }
      throw err
    }
  }

  async function status(request: Request): Promise<Response> {
    if (!sameOrigin(request, config.site(request))) return fail(403, 'forbidden', 'origin')
    const session = await config.readSession(request)
    const id = session?.draft.checkout_id
    if (!session || !id) return fail(404, 'not_found', msg.expiredCart)
    try {
      const sf = await config.client(request)
      const found = await sf.checkouts.get(id)
      if (!found) return fail(404, 'not_found', msg.expiredCart)
      const attempt = checkoutToAttempt(found)
      const headers = new Headers()
      await config.settle({ draft: session.draft, result: attempt, headers })
      return json(attempt, { headers })
    } catch (err) {
      if (isStorefrontError(err)) {
        const { status: code, body } = payErrorResponse(err)
        return json(body, { status: code })
      }
      throw err
    }
  }

  async function cash(args: Parameters<EmbeddedPayHandlers['cash']>[0]): Promise<CashOutcome> {
    const { sf, request, cartId, fields, choice, before } = args
    const providerData = cashProviderData(choice.points, fields.cash_point)
    if (!providerData) return { kind: 'error', status: 422, message: msg.cashChoosePoint, fields: ['cash_point'] }
    const created = await sf.carts.checkout(
      cartId,
      { payment_method: choice.methodKey, payment_flow: 'embedded', payment_option: 'cash', return_url: `${config.site(request)}${config.returnPath}` },
      { idempotencyKey: `chk-${cartId}-cash` },
    )
    const draft = config.createDraft({ created, before, fields })
    // One fixed key per checkout: a double submit returns the SAME voucher.
    const result = await sf.checkouts.pay(created.checkout.id, { method: 'cash', provider_data: providerData }, { idempotencyKey: paymentIdempotencyKey(created.checkout.id, 'cash') })
    const headers = new Headers()
    if (await config.settle({ draft, result, headers })) return { kind: 'done', headers }
    const outcome = paymentOutcome(result, locale)
    return { kind: 'error', status: safeHttpsUrl(outcome.redirect_url) ? 409 : 422, message: outcome.message, fields: [] }
  }

  return { pay, status, cash }
}
