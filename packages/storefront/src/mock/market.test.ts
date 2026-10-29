import { describe, expect, it } from 'vitest'
import { createStorefrontClient, type ShopMarket, type StorefrontErrorCode } from '../index.js'
import { createMockStorefront } from './index.js'

const US: ShopMarket = { code: 'us', currency_code: 'USD', locale: 'en-US', prices_include_tax: false, pricing: 'strict' }
const client = (mock: ReturnType<typeof createMockStorefront>, token = 'sk_mock') =>
  createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token, fetch: mock.fetch })

async function readyCart(sf: ReturnType<typeof client>) {
  const variant = (await sf.products.list({ first: 1 })).nodes[0]!.variants[0]!
  let cart = await sf.carts.create({ lines: [{ variant_id: variant.id, quantity: 1 }] })
  cart = await sf.carts.setBuyer(cart.id, { email: 'comprador@example.com' })
  cart = await sf.carts.setDelivery(cart.id, { method: 'pickup', branch_id: 'br_centro' })
  return cart
}

describe('mock market (contract 1.22.0)', () => {
  it('without the option serves no market at all (unchanged behavior)', async () => {
    const mock = createMockStorefront()
    const sf = client(mock)
    const shop = await sf.shop.get()
    expect('market' in shop).toBe(false)
    expect(shop.currency_code).toBe('MXN')
    const cart = await sf.carts.create()
    expect('market' in cart).toBe(false)
    const res = await mock.fetch('https://mock.local/api/gw/storefront/shop', { headers: { Authorization: 'Bearer sk_mock' } })
    expect(res.headers.get('x-storefront-market')).toBeNull()
    expect(res.headers.get('vary')).toBeNull()
  })

  it('serves a market in another currency: shop, prices, cart and headers', async () => {
    const mock = createMockStorefront({ market: US })
    const sf = client(mock)
    const shop = await sf.shop.get()
    expect(shop.market).toEqual(US)
    expect(shop).toMatchObject({ currency_code: 'USD', locale: 'en-US' })
    expect(shop.policies.free_shipping_min?.currency_code).toBe('USD')
    const product = (await sf.products.list({ first: 1 })).nodes[0]!
    expect(product.variants[0]!.price.currency_code).toBe('USD')
    const cart = await readyCart(sf)
    expect(cart.market).toBe('us')
    expect(cart.cost.total.currency_code).toBe('USD')
    expect((await sf.carts.paymentMethods(cart.id)).market).toBe('us')
    const res = await mock.fetch('https://mock.local/api/gw/storefront/products', { headers: { Authorization: 'Bearer sk_mock' } })
    expect(res.headers.get('x-storefront-market')).toBe('us')
    expect(res.headers.get('vary')).toBe('X-Storefront-Domain')
    const priv = await mock.fetch(`https://mock.local/api/gw/storefront/carts/${cart.id}`, { headers: { Authorization: 'Bearer sk_mock' } })
    expect(priv.headers.get('x-storefront-market')).toBeNull()
  })

  it('explicit `currency` still wins over the market', async () => {
    const shop = await client(createMockStorefront({ market: US, currency: 'MXN' })).shop.get()
    expect(shop.policies.free_shipping_min?.currency_code).toBe('MXN')
    expect(shop.market?.code).toBe('us')
  })

  it('paying a cart of another market answers 409 cart_market_mismatch', async () => {
    const mock = createMockStorefront({ market: US })
    const sf = client(mock)
    const cart = await readyCart(sf)
    ;(mock.state.shop as { market?: ShopMarket | null }).market = { ...US, code: 'ca', currency_code: 'CAD' }
    const code: StorefrontErrorCode = 'cart_market_mismatch'
    await expect(sf.carts.checkout(cart.id, { payment_method: 'card', return_url: 'https://shop.example/gracias' })).rejects.toMatchObject({ status: 409, code })
    ;(mock.state.shop as { market?: ShopMarket | null }).market = US
    const result = await sf.carts.checkout(cart.id, { payment_method: 'card', return_url: 'https://shop.example/gracias' })
    expect(result.order.number).toBeTruthy()
  })
})
