import { describe, expect, it, vi } from 'vitest'
import { StorefrontError } from '@asteby/storefront'
import { PENDING_STREET, createQuoteHandler, quotable, quoteDelivery, readQuoteBody } from './server.js'

const m = (a: string) => ({ amount: a, currency_code: 'MXN' })
const rate = (id: string) => ({ id, title: id, cost: m('199.00') })
const body = { zip: '06600', province: 'Ciudad de México', city: 'CDMX' }
const post = (b: unknown) => new Request('https://x.test/pagar/envio', { method: 'POST', body: JSON.stringify(b) })
const sfWith = (over: Record<string, unknown> = {}) => ({ carts: { setShippingAddress: vi.fn(async () => ({})), deliveryOptions: vi.fn(async () => ({ rates: [rate('a')], pickup: [] })), ...over } }) as never

describe('live quote server', () => {
  it('reads only the address fields, trimmed', () => {
    const b = readQuoteBody({ zip: ' 06600 ', evil: 'x', address1: 5 })
    expect(b.zip).toBe('06600')
    expect(b.address1).toBe('')
    expect('evil' in b).toBe(false)
  })
  it('quotable needs 5 digits, state and city but not the street', () => {
    expect(quotable(readQuoteBody(body))).toBe(true)
    expect(quotable(readQuoteBody({ ...body, zip: '0660' }))).toBe(false)
  })
  it('saves the address with the placeholder street and returns the options untouched', async () => {
    const sf = sfWith()
    const out = await quoteDelivery(sf, 'c1', readQuoteBody(body))
    expect((sf as never as { carts: { setShippingAddress: ReturnType<typeof vi.fn> } }).carts.setShippingAddress).toHaveBeenCalledWith('c1', expect.objectContaining({ address1: PENDING_STREET, country_code: 'MX' }))
    expect(out.rates).toHaveLength(1)
  })
  it('retries when a carrier timed out and applies the rate filter', async () => {
    const deliveryOptions = vi.fn().mockResolvedValueOnce({ rates: [], pickup: [], unavailable: [{ provider: 'p', code: 'timeout' }] }).mockResolvedValue({ rates: [rate('a'), rate('b')], pickup: [] })
    const out = await quoteDelivery(sfWith({ deliveryOptions }), 'c1', readQuoteBody(body), { filterRates: (r) => r.filter((x) => x.id === 'b') })
    expect(deliveryOptions).toHaveBeenCalledTimes(2)
    expect(out.rates.map((r) => r.id)).toEqual(['b'])
  })
  it('handler: JSON always, 405 on GET, 409 without cart, 422 incomplete, 4xx from OPS passthrough, 503 otherwise', async () => {
    const h = createQuoteHandler({ storefront: async () => sfWith(), readCartId: async () => 'c1' })
    expect((await h(new Request('https://x.test', { method: 'GET' }))).status).toBe(405)
    const ok = await h(post(body))
    expect(ok.status).toBe(200)
    expect((await ok.json()).rates).toHaveLength(1)
    expect(ok.headers.get('Cache-Control')).toBe('private, no-store')
    expect((await h(post({ zip: '1' }))).status).toBe(422)
    expect((await createQuoteHandler({ storefront: async () => sfWith(), readCartId: async () => null })(post(body))).status).toBe(409)
    const rejected = createQuoteHandler({ storefront: async () => sfWith({ setShippingAddress: async () => { throw new StorefrontError({ status: 422, code: 'invalid_state', message: 'CP no coincide', field: 'zip' } as never) } }), readCartId: async () => 'c1' })
    const r = await rejected(post(body))
    expect(r.status).toBe(422)
    expect((await r.json()).error.field).toBe('zip')
    const onError = vi.fn()
    const down = createQuoteHandler({ storefront: async () => sfWith({ deliveryOptions: async () => { throw new Error('boom') } }), readCartId: async () => 'c1', onError })
    expect((await down(post(body))).status).toBe(503)
    expect(onError).toHaveBeenCalled()
  })
})
