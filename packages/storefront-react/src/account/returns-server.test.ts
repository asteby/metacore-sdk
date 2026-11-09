import { createStorefrontClient, type Order } from '@asteby/storefront'
import { describe, expect, it } from 'vitest'
import { createReturnRequestAction, parseReturnForm, returnIdempotencyKey, RETURN_FORM } from './server.js'

const money = { amount: '10.00', currency_code: 'MXN' }
const delivered = (at: string | null = '2026-09-01T12:00:00Z'): Order => ({
  id: 'ord_1',
  number: '1001',
  status: 'delivered',
  created_at: '2026-08-20T10:00:00Z',
  total: money,
  lines: [
    { title: 'Balata', variant_title: null, sku: 'BC-1', quantity: 3, unit: money, total: money, image: null },
    { title: 'Disco', variant_title: 'Delantero', sku: 'DS-2', quantity: 1, unit: money, total: money, image: null },
  ],
  progress: { stage: 'delivered', steps: [{ key: 'delivered', state: 'done', at }] },
})

type Seen = { method: string; url: string; headers: Headers; body: unknown }

/** A store whose API is `order` and a returns endpoint answering `returnsStatus`; records every call. */
function store(order: Order | null, returnsStatus = 201, errBody: unknown = { error: { code: 'x', message: 'm' } }) {
  const seen: Seen[] = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    seen.push({ method: init?.method ?? 'GET', url, headers, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    if (url.endsWith('/returns')) return returnsStatus === 201 ? json(201, { id: 'ret_1', order_id: 'ord_1', status: 'requested' }) : json(returnsStatus, errBody)
    return order ? json(200, order) : json(404, { error: { code: 'not_found', message: 'nope' } })
  }
  const storefront = createStorefrontClient({ baseUrl: 'https://api.test', token: 'sk_test', fetch: fetch as typeof globalThis.fetch })
  return { storefront, seen, posts: () => seen.filter((s) => s.method === 'POST') }
}

const post = (fields: Record<string, string>, headers: Record<string, string> = {}) => {
  const body = new URLSearchParams(fields)
  return new Request('https://shop.test/cuenta/pedidos/ord_1', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body })
}
const base = { intent: 'request-return', order_id: 'ord_1' }
const pick = (extra: Record<string, string> = {}) => ({ ...base, 'lines.0.sku': 'BC-1', 'lines.0.selected': '1', 'lines.0.quantity': '2', 'lines.1.sku': 'DS-2', 'lines.1.quantity': '1', reason: 'defective', notes: 'Llegaron rotas', ...extra })
const token = () => 'cust_tok'

describe('parseReturnForm', () => {
  const form = (fields: Record<string, string>) => {
    const f = new FormData()
    for (const [k, v] of Object.entries(fields)) f.append(k, v)
    return f
  }
  const o = delivered()

  it('keeps only the checked lines and builds the API input', () => {
    const r = parseReturnForm(form(pick()), o)
    expect(r).toEqual({ input: { lines: [{ sku: 'BC-1', quantity: 2 }], reason: 'defective', notes: 'Llegaron rotas' }, values: { lines: { 'BC-1': 2 }, reason: 'defective', notes: 'Llegaron rotas' } })
  })

  it('omits reason and notes when empty (the server default applies)', () => {
    const r = parseReturnForm(form(pick({ reason: '', notes: '   ' })), o)
    expect('input' in r && r.input).toEqual({ lines: [{ sku: 'BC-1', quantity: 2 }] })
  })

  it('needs at least one line', () => {
    expect(parseReturnForm(form({ ...base, 'lines.0.sku': 'BC-1', 'lines.0.quantity': '1' }), o)).toMatchObject({ fieldErrors: { lines: 'lines_required' } })
    expect(parseReturnForm(form(base), o)).toMatchObject({ fieldErrors: { lines: 'lines_required' } })
  })

  it.each([['0'], ['4'], ['-1'], ['1.5'], ['abc'], [''], ['1e2'], ['9999999']])('rejects quantity %j (1..3, whole)', (q) => {
    expect(parseReturnForm(form(pick({ 'lines.0.quantity': q })), o)).toMatchObject({ fieldErrors: { 'lines.0': 'invalid_quantity' } })
  })

  it('accepts the bounds 1 and max', () => {
    expect(parseReturnForm(form(pick({ 'lines.0.quantity': '3' })), o)).toHaveProperty('input')
    expect(parseReturnForm(form(pick({ 'lines.0.quantity': '1' })), o)).toHaveProperty('input')
  })

  it('rejects a SKU that is not in the order and a repeated SKU', () => {
    expect(parseReturnForm(form(pick({ 'lines.0.sku': 'HACK' })), o)).toMatchObject({ fieldErrors: { 'lines.0': 'invalid' } })
    const dup = parseReturnForm(form({ ...pick(), 'lines.1.sku': 'BC-1', 'lines.1.selected': '1' }), o)
    expect(dup).toMatchObject({ fieldErrors: { 'lines.1': 'invalid' } })
  })

  it('allows only the four reasons', () => {
    for (const r of ['defective', 'not_wanted', 'wrong_item', 'warranty']) expect(parseReturnForm(form(pick({ reason: r })), o)).toHaveProperty('input')
    expect(parseReturnForm(form(pick({ reason: 'because' })), o)).toMatchObject({ fieldErrors: { reason: 'invalid_reason' } })
    expect(parseReturnForm(form(pick({ reason: 'defective' })), o, { allowedReasons: ['warranty'] })).toMatchObject({ fieldErrors: { reason: 'invalid_reason' } })
  })

  it('caps notes at 500 characters (a code point is one), after normalising newlines', () => {
    expect(parseReturnForm(form(pick({ notes: 'a'.repeat(500) })), o)).toHaveProperty('input')
    expect(parseReturnForm(form(pick({ notes: 'a'.repeat(501) })), o)).toMatchObject({ fieldErrors: { notes: 'notes_too_long' } })
    expect(parseReturnForm(form(pick({ notes: '😀'.repeat(500) })), o)).toHaveProperty('input')
    expect(parseReturnForm(form(pick({ notes: 'a\r\n'.repeat(250) })), o)).toHaveProperty('input')
  })

  it('echoes what was typed so a page without JS can show it again', () => {
    const r = parseReturnForm(form(pick({ 'lines.0.quantity': '9', notes: 'hola' })), o)
    expect(r.values).toEqual({ lines: { 'BC-1': 9 }, reason: 'defective', notes: 'hola' })
  })
})

describe('returnIdempotencyKey', () => {
  it('is stable for the same request (line order does not matter) and changes with any part of it', async () => {
    const a = await returnIdempotencyKey('o', { lines: [{ sku: 'A', quantity: 1 }, { sku: 'B', quantity: 2 }], reason: 'defective' })
    const b = await returnIdempotencyKey('o', { lines: [{ sku: 'B', quantity: 2 }, { sku: 'A', quantity: 1 }], reason: 'defective' })
    expect(a).toBe(b)
    expect(a).toMatch(/^return-[0-9a-f]{64}$/)
    expect(await returnIdempotencyKey('o2', { lines: [{ sku: 'A', quantity: 1 }, { sku: 'B', quantity: 2 }], reason: 'defective' })).not.toBe(a)
    expect(await returnIdempotencyKey('o', { lines: [{ sku: 'A', quantity: 2 }, { sku: 'B', quantity: 2 }], reason: 'defective' })).not.toBe(a)
    expect(await returnIdempotencyKey('o', { lines: [{ sku: 'A', quantity: 1 }, { sku: 'B', quantity: 2 }], reason: 'defective', notes: 'x' })).not.toBe(a)
  })
})

describe('createReturnRequestAction', () => {
  it('requests the return with the buyer token and a stable Idempotency-Key', async () => {
    const s = store(delivered())
    const action = createReturnRequestAction({ storefront: s.storefront, readCustomerToken: token })
    const first = await action({ request: post(pick()) })
    expect(first).toEqual({ ok: true, intent: 'request-return', orderId: 'ord_1', request: { id: 'ret_1', order_id: 'ord_1', status: 'requested' } })
    const [p] = s.posts()
    expect(p!.url).toBe('https://api.test/storefront/customer/orders/ord_1/returns')
    expect(p!.body).toEqual({ lines: [{ sku: 'BC-1', quantity: 2 }], reason: 'defective', notes: 'Llegaron rotas' })
    expect(p!.headers.get('idempotency-key')).toMatch(/^return-[0-9a-f]{64}$/)
    expect(JSON.stringify([...p!.headers])).toContain('cust_tok')

    await action({ request: post(pick()) })
    expect(s.posts()[1]!.headers.get('idempotency-key')).toBe(p!.headers.get('idempotency-key'))
    await action({ request: post(pick({ 'lines.0.quantity': '3' })) })
    expect(s.posts()[2]!.headers.get('idempotency-key')).not.toBe(p!.headers.get('idempotency-key'))
  })

  it('returns field errors and the typed values WITHOUT calling the API', async () => {
    const s = store(delivered())
    const action = createReturnRequestAction({ storefront: s.storefront, readCustomerToken: token })
    const r = await action({ request: post(pick({ 'lines.0.quantity': '7', notes: 'n'.repeat(501), reason: 'zzz' })) })
    expect(r).toMatchObject({ ok: false, error: { code: 'validation' }, fieldErrors: { 'lines.0': 'invalid_quantity', reason: 'invalid_reason', notes: 'notes_too_long' }, values: { lines: { 'BC-1': 7 } } })
    expect(s.posts()).toHaveLength(0)
  })

  it('needs a session', async () => {
    const s = store(delivered())
    const action = createReturnRequestAction({ storefront: s.storefront, readCustomerToken: () => null })
    expect(await action({ request: post(pick()) })).toMatchObject({ ok: false, error: { code: 'unauthorized' } })
    expect(s.seen).toHaveLength(0)
  })

  it('reports an order that is not the buyer’s (404) or not delivered', async () => {
    const missing = createReturnRequestAction({ storefront: store(null).storefront, readCustomerToken: token })
    expect(await missing({ request: post(pick()) })).toMatchObject({ error: { code: 'not_found' } })
    const s = store({ ...delivered(), status: 'shipped', progress: { stage: 'in_transit', steps: [] } })
    const action = createReturnRequestAction({ storefront: s.storefront, readCustomerToken: token })
    expect(await action({ request: post(pick()) })).toMatchObject({ error: { code: 'not_returnable' } })
    expect(s.posts()).toHaveLength(0)
  })

  it('enforces the store window when given, and only warranty after the return window', async () => {
    const now = () => new Date('2026-10-15T12:00:00Z')
    const s = store(delivered('2026-09-01T12:00:00Z'))
    const closed = createReturnRequestAction({ storefront: s.storefront, readCustomerToken: token, eligibility: { returnsDays: 30 }, now })
    expect(await closed({ request: post(pick()) })).toMatchObject({ error: { code: 'not_returnable' } })
    const warranty = createReturnRequestAction({ storefront: s.storefront, readCustomerToken: token, eligibility: { returnsDays: 30, warrantyDays: 365 }, now })
    expect(await warranty({ request: post(pick({ reason: 'not_wanted' })) })).toMatchObject({ fieldErrors: { reason: 'invalid_reason' } })
    expect(await warranty({ request: post(pick({ reason: 'warranty' })) })).toMatchObject({ ok: true })
  })

  it.each([
    [422, 'validation'],
    [409, 'not_returnable'],
    [404, 'not_found'],
    [401, 'unauthorized'],
    [429, 'rate_limited'],
    [500, 'unavailable'],
  ])('maps an API %i to %s', async (status, code) => {
    const s = store(delivered(), status)
    const action = createReturnRequestAction({ storefront: s.storefront, readCustomerToken: token })
    const r = await action({ request: post(pick()) })
    expect(r).toMatchObject({ ok: false, error: { code }, values: { reason: 'defective' } })
  })

  it('maps a rejected notes/reason field to its control, and a missing scope to store_misconfigured', async () => {
    const field = createReturnRequestAction({ storefront: store(delivered(), 422, { error: { code: 'invalid', message: 'too long', field: 'notes' } }).storefront, readCustomerToken: token })
    expect(await field({ request: post(pick()) })).toMatchObject({ error: { code: 'validation' }, fieldErrors: { notes: 'notes_too_long' } })
    const scope = createReturnRequestAction({ storefront: store(delivered(), 403, { error: { code: 'insufficient_scope', message: 'scope' } }).storefront, readCustomerToken: token })
    expect(await scope({ request: post(pick()) })).toMatchObject({ error: { code: 'store_misconfigured' } })
  })

  it('never leaks the server message nor the token in its answer', async () => {
    const action = createReturnRequestAction({ storefront: store(delivered(), 422, { error: { code: 'invalid', message: 'SECRET-DETAIL' } }).storefront, readCustomerToken: token })
    const out = JSON.stringify(await action({ request: post(pick()) }))
    expect(out).not.toContain('SECRET-DETAIL')
    expect(out).not.toContain('cust_tok')
  })

  it('rejects cross-site posts and other intents', async () => {
    const s = store(delivered())
    const action = createReturnRequestAction({ storefront: s.storefront, readCustomerToken: token })
    expect(await action({ request: post(pick(), { 'sec-fetch-site': 'cross-site' }) })).toMatchObject({ ok: false })
    expect(await action({ request: post(pick(), { origin: 'https://evil.test' }) })).toMatchObject({ ok: false })
    expect(await action({ request: post(pick({ intent: 'other' })) })).toMatchObject({ error: { code: 'validation' } })
    expect(s.seen).toHaveLength(0)
    expect(await action({ request: post(pick(), { origin: 'https://shop.test' }) })).toMatchObject({ ok: true })
  })

  it('exports the control names the component renders', () => {
    expect(RETURN_FORM.quantity(2)).toBe('lines.2.quantity')
  })
})
