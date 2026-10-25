import { describe, expect, it, vi } from 'vitest'
import { StorefrontError, type StorefrontClient } from '@asteby/storefront'
import { createEmbeddedPayHandlers, jsonPayRoute, deviceSessionId, paymentCsp, paymentCspHeaders, paymentCspMode, paymentNonce, paymentNonceFromHeaders, sameOrigin, createRateLimiter, type EmbeddedPayConfig, type PaySession } from './server.js'

type Draft = { checkout_id?: string; number?: string | null }
const total = { amount: '500.00', currency_code: 'MXN' }
const client = { kind: 'fake', sdk_url: 'https://sdk.example.com/js', public_key: 'pk' }
const methods = {
  methods: [
    { key: 'prov', kind: 'provider', default: true, client, options: [
      { key: 'card', redirect: false },
      { key: 'cash', redirect: false, points: [{ id: 'a', payment_method_id: 'store', label: 'T', group: 'main' }] },
    ] },
    { key: 'manual', kind: 'builtin', default: false },
  ],
  market: null,
}
const created = { order: { id: 'o1', number: null }, checkout: { id: 'chk1', status: 'pending', total }, payment: { provider: 'p', status: 'pending' } }
const paid = { payment: { provider: 'p', status: 'paid', outcome: 'approved' }, checkout: { id: 'chk1', status: 'paid', total } }

function fakeSf(over: { pay?: () => Promise<unknown>; get?: () => Promise<unknown> } = {}) {
  const calls = { checkout: vi.fn(async () => created), pay: vi.fn(over.pay ?? (async () => paid)), setup: vi.fn() }
  const sf = {
    carts: { paymentMethods: vi.fn(async () => methods), get: vi.fn(async () => ({ id: 'cart1' })), checkout: calls.checkout },
    checkouts: { pay: calls.pay, get: vi.fn(over.get ?? (async () => ({ ...created, checkout: { ...created.checkout, status: 'paid' } }))) },
  } as unknown as StorefrontClient
  return { sf, calls }
}

function setup(sfOver?: Parameters<typeof fakeSf>[0], cfg: Partial<EmbeddedPayConfig<Draft>> = {}, stored: PaySession<Draft> | null = null) {
  const { sf, calls } = fakeSf(sfOver)
  const settle = vi.fn(async ({ headers, result }: { headers: Headers; result: { payment: { status: string } } }) => {
    if (result.payment.status === 'paid') {
      headers.append('Set-Cookie', 'receipt=1')
      return true
    }
    return false
  })
  const prepareCart = vi.fn(async () => {})
  const h = createEmbeddedPayHandlers<Draft>({
    client: async () => sf,
    site: () => 'https://shop.test',
    returnPath: '/gracias',
    readCartId: async () => 'cart1',
    readSession: async () => stored,
    serializeSession: async (s) => `pay=${s.draft.checkout_id}`,
    validateFields: (f) => (f.email ? null : 'Faltan campos'),
    prepareCart,
    createDraft: ({ created }) => ({ checkout_id: created.checkout.id }),
    settle,
    hide: ['manual'],
    log: () => {},
    ...cfg,
  })
  return { h, sf, calls, settle, prepareCart }
}

const body = (over: Record<string, unknown> = {}) => ({
  option: 'card',
  attempt: 'attempt-12345',
  provider_data: { token: 't', transaction_amount: 1 },
  expected_total: total,
  fields: { email: 'a@b.co', payment_choice: 'prov|card' },
  ...over,
})
const req = (b: unknown, headers: Record<string, string> = {}) =>
  new Request('https://shop.test/pagar/cobrar', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(b) })

describe('pay', () => {
  it('creates the checkout once with expected_total, charges with an idempotency key and closes the order', async () => {
    const { h, calls, prepareCart } = setup()
    const res = await h.pay(req(body()))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(res.headers.get('Set-Cookie')).toBe('receipt=1')
    expect(prepareCart).toHaveBeenCalledOnce()
    expect(calls.checkout.mock.calls[0]).toMatchObject([
      'cart1',
      { payment_method: 'prov', payment_flow: 'embedded', payment_option: 'card', expected_total: total, return_url: 'https://shop.test/gracias' },
      { idempotencyKey: 'chk-cart1' },
    ])
    const [id, input, opts] = calls.pay.mock.calls[0] as unknown as [string, Record<string, unknown>, { idempotencyKey: string }]
    expect(id).toBe('chk1')
    expect(input.expected_total).toEqual(total)
    expect(JSON.stringify(input.provider_data)).not.toContain('transaction_amount')
    expect(opts.idempotencyKey).toContain('chk1')
  })
  it('keeps the session while the order is not closed and a retry reuses the checkout', async () => {
    const pending = { payment: { provider: 'p', status: 'requires_action', outcome: 'challenge' } }
    const first = setup({ pay: async () => pending })
    const res = await first.h.pay(req(body()))
    expect(res.headers.get('Set-Cookie')).toBe('pay=chk1')
    const retry = setup(undefined, {}, { cart_id: 'cart1', draft: { checkout_id: 'chk1' } })
    await retry.h.pay(req(body()))
    expect(retry.calls.checkout).not.toHaveBeenCalled()
    expect(retry.prepareCart).not.toHaveBeenCalled()
    expect(retry.calls.pay).toHaveBeenCalledOnce()
  })
  it('refuses forged or hidden rows, bad bodies, other origins and a missing cart', async () => {
    const { h, calls } = setup()
    expect((await h.pay(req(body({ fields: { email: 'a@b.co', payment_choice: 'manual' } })))).status).toBe(422)
    expect((await h.pay(req(body({ fields: { email: 'a@b.co', payment_choice: 'prov|cash' } })))).status).toBe(422)
    expect((await h.pay(req(body({ fields: { payment_choice: 'prov|card' } })))).status).toBe(400)
    expect((await h.pay(req(body({ attempt: 'x' })))).status).toBe(400)
    expect((await h.pay(req(body({ expected_total: { amount: 'abc', currency_code: 'MXN' } })))).status).toBe(400)
    expect((await h.pay(req(body({ option: 'cash' })))).status).toBe(400)
    expect((await h.pay(new Request('https://shop.test/x', { method: 'POST', body: 'no json' }))).status).toBe(400)
    expect((await h.pay(req(body(), { origin: 'https://evil.test' }))).status).toBe(403)
    expect(calls.pay).not.toHaveBeenCalled()
    const noCart = setup(undefined, { readCartId: async () => null })
    expect((await noCart.h.pay(req(body()))).status).toBe(409)
  })
  it('maps OPS errors to the codes the browser reads and logs the exact reason', async () => {
    const log = vi.fn()
    const { h } = setup({ pay: async () => { throw new StorefrontError({ status: 422, code: 'validation', field: 'expected_total', message: 'cambió' } as never) } }, { log })
    const res = await h.pay(req(body()))
    expect(res.status).toBe(422)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('price_mismatch')
    expect(res.headers.get('Set-Cookie')).toBe('pay=chk1')
    expect(log).toHaveBeenCalledOnce()
  })
  it('rate limits per client', async () => {
    const { h } = setup(undefined, { rateLimit: { limit: 1 } })
    expect((await h.pay(req(body()))).status).toBe(200)
    const res = await h.pay(req(body()))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
  })
})

describe('status', () => {
  it('re-reads the checkout without ids from the browser', async () => {
    const { h, settle } = setup(undefined, {}, { cart_id: 'cart1', draft: { checkout_id: 'chk1' } })
    const res = await h.status(new Request('https://shop.test/s', { method: 'POST' }))
    expect(((await res.json()) as { payment: { status: string } }).payment.status).toBe('paid')
    expect(settle).toHaveBeenCalledOnce()
    expect(res.headers.get('Set-Cookie')).toBe('receipt=1')
  })
  it('without a payment session answers 200 `none` (not 404) and says whether the cart is still there', async () => {
    const { h } = setup()
    const res = await h.status(new Request('https://shop.test/s', { method: 'POST' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ payment: { provider: '', status: 'none' }, recoverable: true })
    const gone = setup(undefined, { readCartId: async () => null })
    expect(await (await gone.h.status(new Request('https://shop.test/s', { method: 'POST' }))).json()).toMatchObject({ payment: { status: 'none' }, recoverable: false })
  })
})

describe('cash', () => {
  const choice = { value: 'prov|cash', methodKey: 'prov', option: 'cash', mode: 'cash', label: null, points: [{ id: 'a', payment_method_id: 'store', label: 'T', group: 'main' }], maxInstallments: null } as never
  it('asks for the voucher with a fixed key and closes the order', async () => {
    const { h, sf, calls } = setup({ pay: async () => ({ payment: { provider: 'p', status: 'paid', outcome: 'approved' } }) })
    const out = await h.cash({ sf, request: req({}), cartId: 'cart1', fields: { cash_point: 'a' }, choice, before: null })
    expect(out.kind).toBe('done')
    expect(calls.checkout.mock.calls[0]![1]).toMatchObject({ payment_option: 'cash', payment_flow: 'embedded' })
    expect(calls.pay.mock.calls[0]![1]).toEqual({ method: 'cash', provider_data: { payment_method_id: 'store' } })
  })
  it('refuses a forged cash point', async () => {
    const { h, sf, calls } = setup()
    const out = await h.cash({ sf, request: req({}), cartId: 'cart1', fields: { cash_point: 'zzz' }, choice, before: null })
    expect(out).toMatchObject({ kind: 'error', status: 422, fields: ['cash_point'] })
    expect(calls.checkout).not.toHaveBeenCalled()
  })
})

describe('helpers', () => {
  it('sameOrigin compares hosts only', () => {
    expect(sameOrigin(new Request('https://a.test/x'), 'https://a.test')).toBe(true)
    expect(sameOrigin(new Request('https://a.test/x', { headers: { origin: 'http://a.test:3000' } }), 'https://a.test')).toBe(true)
    expect(sameOrigin(new Request('https://a.test/x', { headers: { origin: 'https://evil.test' } }), 'https://a.test')).toBe(false)
  })
  it('deviceSessionId drops oversized or odd values instead of failing', () => {
    expect(deviceSessionId('abc-1.2:3')).toBe('abc-1.2:3')
    expect(deviceSessionId('x'.repeat(201))).toBeUndefined()
    expect(deviceSessionId('a b')).toBeUndefined()
    expect(deviceSessionId(5)).toBeUndefined()
  })
  it('rate limiter forgets after the window', () => {
    const l = createRateLimiter({ limit: 1, windowMs: 1000 })
    expect(l.hit('k', 0).allowed).toBe(true)
    expect(l.hit('k', 10).allowed).toBe(false)
    expect(l.hit('k', 1500).allowed).toBe(true)
  })
  it('csp: mode, nonce, hashes and headers', () => {
    expect(paymentCspMode(undefined, true)).toBe('report-only')
    expect(paymentCspMode(undefined, false)).toBe('off')
    expect(paymentCspMode('ENFORCE', false)).toBe('enforce')
    const nonce = paymentNonce()
    expect(nonce).toMatch(/^[A-Za-z0-9+/=]{24}$/)
    expect(paymentCspHeaders([client], { mode: 'off' })).toEqual({})
    const h = paymentCspHeaders([client], { mode: 'report-only', nonce, scriptHashes: ["'sha256-abc='", "'unsafe-eval'"], imgHttps: true })
    const [name, value] = Object.entries(h)[0]!
    expect(name).toBe('Content-Security-Policy-Report-Only')
    expect(value).toContain("'sha256-abc='")
    expect(value).not.toContain('unsafe-eval')
    expect(value).toContain("img-src 'self' data: https:")
    expect(paymentNonceFromHeaders(new Headers(h))).toBe(nonce)
    expect(paymentCsp([client])).not.toContain('https: ')
  })
})

describe('always JSON, never 502-504, with retryable and kind', () => {
  const ops = (status: number, code: string, retryable?: boolean, extra: Record<string, unknown> = {}) =>
    new StorefrontError({ status, code, message: 'technical english', ...(retryable === undefined ? {} : { retryable }), ...extra })
  const post = (h: ReturnType<typeof setup>['h']) => h.pay(req(body()))

  it('502 unavailable retryable:true -> 500 JSON transient, and the payment session cookie survives', async () => {
    const { h } = setup({ pay: async () => { throw ops(502, 'unavailable', true) } })
    const res = await post(h)
    expect(res.status).toBe(500)
    expect(res.headers.get('content-type')).toContain('json')
    expect(res.headers.get('Set-Cookie')).toBe('pay=chk1')
    expect(await res.json()).toMatchObject({ error: { code: 'unavailable', retryable: true, kind: 'transient' } })
  })
  it('502 payment_provider_rejected retryable:false -> definitive provider_declined', async () => {
    const { h } = setup({ pay: async () => { throw ops(502, 'payment_provider_rejected', false) } })
    const res = await post(h)
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ error: { retryable: false, kind: 'provider_declined' } })
  })
  it('502 payment_provider_misconfigured -> merchant_config; 422 invalid_state with checkout_id -> stale_checkout', async () => {
    expect(await (await post(setup({ pay: async () => { throw ops(502, 'payment_provider_misconfigured', false) } }).h)).json()).toMatchObject({ error: { kind: 'merchant_config' } })
    const stale = await post(setup({ pay: async () => { throw ops(422, 'invalid_state', undefined, { checkoutId: 'chk1' }) } }).h)
    expect(stale.status).toBe(422)
    expect(await stale.json()).toMatchObject({ error: { kind: 'stale_checkout', retryable: false } })
  })
  it('a thrown exception becomes a retryable JSON 500', async () => {
    const { h } = setup({ pay: async () => { throw new Error('boom') } }, { log: () => {} })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await post(h)
    warn.mockRestore()
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ error: { retryable: true, kind: 'transient' } })
  })
  it('the shop own refusals carry kind too (method not offered is not a stale checkout)', async () => {
    const { h } = setup()
    const res = await h.pay(req(body({ fields: { email: 'a@b.co', payment_choice: 'prov|wallet' } })))
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: { code: 'invalid_state', kind: 'other', retryable: false, field: 'payment_choice' } })
  })
  it('jsonPayRoute turns an HTML 503 into JSON 500 and keeps cookies', async () => {
    const headers = new Headers({ 'Content-Type': 'text/html' })
    headers.append('Set-Cookie', 'pay=chk1')
    const res = await jsonPayRoute(async () => new Response('<html>Actualizando</html>', { status: 503, headers }), 'pay')
    expect(res.status).toBe(500)
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(res.headers.get('Set-Cookie')).toBe('pay=chk1')
    expect(await res.json()).toMatchObject({ error: { retryable: true, kind: 'transient' } })
  })
  it('jsonPayRoute leaves a successful JSON answer untouched', async () => {
    const ok = new Response('{"payment":{"status":"paid"}}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    expect(await jsonPayRoute(async () => ok, 'pay')).toBe(ok)
  })
})
