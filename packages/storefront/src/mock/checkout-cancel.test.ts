import { describe, expect, it } from 'vitest'
import { createStorefrontClient, StorefrontError } from '../index.js'
import { createMockStorefront } from './index.js'

// `checkouts.cancel`: the buyer cancels (or changes details / pays another way) while the payment is NOT approved.
async function setup() {
  const mock = createMockStorefront()
  const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
  const product = (await sf.products.list({ first: 1 })).nodes[0]!
  const cart = await sf.carts.create({ lines: [{ variant_id: product.variants[0]!.id, quantity: 1 }] })
  await sf.carts.setBuyer(cart.id, { email: 'ana@example.com' })
  await sf.carts.setDelivery(cart.id, { method: 'pickup', branch_id: (await sf.shop.get()).branches[0]!.id })
  const created = await sf.carts.checkout(cart.id, { payment_method: 'mock', payment_flow: 'embedded', return_url: 'https://shop.example/gracias' } as never)
  return { sf, id: created.checkout.id, total: created.checkout.total }
}

describe('checkouts.cancel (mock)', () => {
  it('a pending 3DS challenge the provider cannot void: closed and reported orphaned; idempotent', async () => {
    const { sf, id, total } = await setup()
    const r = await sf.checkouts.pay(id, { method: 'card', provider_data: { token: 'tok_3DS' }, expected_total: total }, { idempotencyKey: 'k1' })
    expect(r.payment.status).toBe('requires_action')
    const out = await sf.checkouts.cancel(id, { reason: 'retry_other_method' })
    expect(out.checkout.status).toBe('cancelled')
    expect(out.cancel).toEqual({ provider_cancelled: false, orphaned: true })
    expect((await sf.checkouts.cancel(id)).checkout.status).toBe('cancelled')
  })

  it('a paid checkout is never cancelled: 409 already_paid', async () => {
    const { sf, id, total } = await setup()
    await sf.checkouts.pay(id, { method: 'card', provider_data: { token: 'tok_APRO' }, expected_total: total }, { idempotencyKey: 'k1' })
    const err = await sf.checkouts.cancel(id).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(StorefrontError)
    expect((err as StorefrontError).status).toBe(409)
    expect((err as StorefrontError).code).toBe('already_paid')
  })
})
