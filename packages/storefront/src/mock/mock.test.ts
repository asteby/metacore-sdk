import { beforeEach, describe, expect, it } from 'vitest'
import { createStorefrontClient, type Product } from '../index.js'
import { MOCK_CUSTOMER_EMAIL, createMockStorefront } from './index.js'

const mock = createMockStorefront()
const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
const pub = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'pk_mock', fetch: mock.fetch })

beforeEach(() => mock.reset())

describe('mock catalog', () => {
  it('serves the shop and ~24 products across 4 collections', async () => {
    const shop = await sf.shop.get()
    expect(shop.name).toBe('Mi tienda')
    const all = await sf.products.list({ first: 100 })
    expect(all.total_count).toBe(24)
    const cols = await sf.collections.list()
    expect(cols.nodes.map((c) => c.handle)).toEqual(['ropa', 'hogar', 'accesorios', 'llantas'])
  })

  it('paginates with cursors without overlap', async () => {
    const seen: string[] = []
    let after: string | null = null
    let pages = 0
    do {
      const page = await sf.products.list({ first: 10, after, sort: 'title_asc' })
      seen.push(...page.nodes.map((p) => p.handle))
      after = page.page_info.has_next_page ? page.page_info.end_cursor : null
      pages++
    } while (after)
    expect(pages).toBe(3)
    expect(seen).toHaveLength(24)
    expect(new Set(seen).size).toBe(24)
    const sorted = [...seen].sort((a, b) => a.localeCompare(b))
    expect(seen.length).toBe(sorted.length)
  })

  it('rejects malformed cursors', async () => {
    await expect(sf.products.list({ after: 'not-a-cursor' })).rejects.toMatchObject({ status: 400, field: 'after' })
  })

  it('filters by attributes, vendor and price, and returns facets', async () => {
    const res = await sf.products.list({ collection: 'llantas', filters: { rim: 16 } })
    expect(res.nodes.map((p) => p.handle).sort()).toEqual(['llanta-205-55-r16-sport', 'llanta-205-55-r16-touring', 'llanta-265-70-r16-at'])
    const rim = res.facets.find((f) => f.key === 'rim')!
    expect(rim.type).toBe('list')
    expect(rim.values.find((v) => v.value === '16')?.count).toBe(3)
    expect(res.facets.find((f) => f.key === 'price')?.type).toBe('price_range')

    const sized = await sf.products.list({ filters: { size_key: '205/55R16', vendor: 'Marca Sur' } })
    expect(sized.nodes.map((p) => p.handle)).toEqual(['llanta-205-55-r16-sport'])

    const cheap = await sf.products.list({ price_max: 200, sort: 'price_asc' })
    const prices = cheap.nodes.map((p) => Number(p.price_range.min.amount))
    expect(prices.every((n) => n <= 200)).toBe(true)
    expect(prices).toEqual([...prices].sort((a, b) => a - b))

    const available = await sf.products.list({ available: true, first: 100 })
    expect(available.nodes.every((p) => p.available_for_sale)).toBe(true)
    expect(available.total_count).toBeLessThan(24)
  })

  it('searches text and resolves handles', async () => {
    const res = await sf.products.list({ q: 'taza' })
    expect(res.nodes[0]?.handle).toBe('taza-ceramica')
    const byHandle = await sf.products.list({ handles: ['gorra-clasica', 'lampara-mesa'] })
    expect(byHandle.nodes).toHaveLength(2)
  })

  it('returns product, recommendations, stock and null for missing', async () => {
    const p = (await sf.products.get('playera-basica')) as Product
    expect(p.variants).toHaveLength(6)
    expect(p.options.map((o) => o.name)).toEqual(['Talla', 'Color'])
    expect(p.featured_image?.url).toContain('picsum.photos/seed/playera-basica')
    expect(await sf.products.get('nope')).toBeNull()
    const recs = await sf.products.recommendations('playera-basica')
    expect(recs.nodes.length).toBeGreaterThan(0)
    expect(recs.nodes.some((r) => r.handle === 'playera-basica')).toBe(false)
    const stock = await sf.stock.get([p.variants[0]!.sku, 'UNKNOWN'])
    expect(stock.nodes).toEqual([{ sku: p.variants[0]!.sku, quantity_available: 15 }])
  })

  it('answers 304 to If-None-Match', async () => {
    const first = await mock.fetch('https://mock.local/api/gw/storefront/shop', { headers: { Authorization: 'Bearer pk_x' } })
    const etag = first.headers.get('ETag')!
    expect(first.headers.get('Cache-Control')).toContain('public')
    const second = await mock.fetch('https://mock.local/api/gw/storefront/shop', { headers: { Authorization: 'Bearer pk_x', 'If-None-Match': etag } })
    expect(second.status).toBe(304)
  })

  it('requires a token and enforces scopes', async () => {
    const res = await mock.fetch('https://mock.local/api/gw/storefront/shop')
    expect(res.status).toBe(401)
    const cart = await pub.carts.create({})
    await expect(pub.carts.checkout(cart.id, { payment_method: 'card', return_url: 'https://x' })).rejects.toMatchObject({ status: 403, code: 'forbidden' })
  })
})

describe('mock end-to-end purchase', () => {
  it('list → filter → product → cart → discount → delivery → checkout', async () => {
    const list = await pub.products.list({ collection: 'ropa', filters: { vendor: 'Casa Textil' }, available: true })
    expect(list.nodes.length).toBeGreaterThan(0)
    const product = (await pub.products.get('playera-basica'))!
    const variant = product.variants.find((v) => v.available_for_sale)!

    let cart = await pub.carts.create({ lines: [{ variant_id: variant.id, quantity: 2 }] })
    expect(cart.total_quantity).toBe(2)
    expect(cart.cost.subtotal.amount).toBe('498.00')

    cart = await pub.carts.addLines(cart.id, [{ variant_id: variant.id, quantity: 1 }])
    expect(cart.lines).toHaveLength(1)
    expect(cart.lines[0]!.quantity).toBe(3)

    const sartenes = (await pub.products.get('set-sartenes'))!
    cart = await pub.carts.addLines(cart.id, [{ variant_id: sartenes.variants[0]!.id, quantity: 1 }])
    expect(cart.cost.subtotal.amount).toBe('2646.00')

    cart = await pub.carts.updateLines(cart.id, [{ id: cart.lines[0]!.id, quantity: 1 }])
    expect(cart.cost.subtotal.amount).toBe('2148.00')

    cart = await pub.carts.setDiscountCodes(cart.id, ['bienvenida10', 'NOPE'])
    expect(cart.discount_codes).toEqual([
      { code: 'BIENVENIDA10', applicable: true },
      { code: 'NOPE', applicable: false },
    ])
    expect(cart.cost.discount.amount).toBe('214.80')
    expect(cart.cost.total.amount).toBe('1933.20')

    cart = await pub.carts.setBuyer(cart.id, { email: 'comprador@example.com' })
    cart = await pub.carts.setShippingAddress(cart.id, { address1: 'Calle 1', city: 'CDMX', zip: '01000', country_code: 'MX' })
    const options = await pub.carts.deliveryOptions(cart.id)
    expect(options.rates[0]).toMatchObject({ id: 'flat', cost: { amount: '0.00' } }) // free over 999
    expect(options.pickup.map((p) => p.branch_id)).toEqual(['br_centro', 'br_norte'])
    cart = await pub.carts.setDelivery(cart.id, { method: 'shipping', rate_id: 'express' })
    expect(cart.cost.shipping?.amount).toBe('249.00')
    cart = await pub.carts.setDelivery(cart.id, { method: 'pickup', branch_id: 'br_centro' })
    expect(cart.cost.shipping?.amount).toBe('0.00')
    expect(cart.cost.tax_included).toBe(true)

    // Checkout needs checkout:write → server token.
    const key = 'idem-1'
    const result = await sf.carts.checkout(cart.id, { payment_method: 'card', return_url: 'https://shop.example/gracias' }, { idempotencyKey: key })
    expect(result.order.number).toBe('1001')
    expect(result.payment.redirect_url).toContain('return_url=https%3A%2F%2Fshop.example%2Fgracias')
    const again = await sf.carts.checkout(cart.id, { payment_method: 'card', return_url: 'https://shop.example/gracias' }, { idempotencyKey: key })
    expect(again.order.id).toBe(result.order.id)

    const after = await sf.stock.get([variant.sku])
    expect(after.nodes[0]!.quantity_available).toBe(14)

    expect(result.checkout.total).toEqual(cart.cost.total)
    expect(result.checkout.stock_hold_expires_at).toMatch(/^\d{4}-/)
    const status = await sf.checkouts.get(result.checkout.id)
    expect(status).toMatchObject({ order: { id: result.order.id }, checkout: { id: result.checkout.id } })
    expect(status!.lines.length).toBeGreaterThan(0)
    expect(await sf.checkouts.get('chk_nope')).toBeNull()
    await expect(pub.checkouts.get(result.checkout.id)).rejects.toMatchObject({ status: 403 })
  })

  it('rejects over-stock and checkout without delivery', async () => {
    const p = (await sf.products.get('paraguas-compacto'))!
    await expect(sf.carts.create({ lines: [{ variant_id: p.variants[0]!.id, quantity: 4 }] })).rejects.toMatchObject({ status: 409, code: 'insufficient_stock' })
    const cart = await sf.carts.create({ lines: [{ variant_id: p.variants[0]!.id, quantity: 1 }] })
    await sf.carts.setBuyer(cart.id, { email: 'a@b.co' })
    await expect(sf.carts.checkout(cart.id, { payment_method: 'card', return_url: 'https://x' })).rejects.toMatchObject({ status: 422, field: 'delivery' })
  })
})

describe('mock customer and content', () => {
  it('logs in with OTP 000000 and lists orders and addresses', async () => {
    await sf.customer.requestOtp({ email: MOCK_CUSTOMER_EMAIL })
    await expect(sf.customer.createSession({ email: MOCK_CUSTOMER_EMAIL, code: '123456' })).rejects.toMatchObject({ status: 401 })
    await sf.customer.requestOtp({ email: MOCK_CUSTOMER_EMAIL })
    const session = await sf.customer.createSession({ email: MOCK_CUSTOMER_EMAIL, code: '000000' })
    const me = sf.withCustomerToken(session.token)
    expect((await me.customer.get()).email).toBe(MOCK_CUSTOMER_EMAIL)
    const orders = await me.customer.orders()
    expect(orders.nodes[0]?.number).toBe('1000')
    expect(await me.customer.order(orders.nodes[0]!.id)).toMatchObject({ number: '1000' })
    expect(await me.customer.order('ord_nope')).toBeNull()
    const addr = await me.customer.addresses.create({ address1: 'Calle 2', city: 'Monterrey', zip: '64000', country_code: 'MX' })
    expect((await me.customer.addresses.list()).nodes).toHaveLength(1)
    await me.customer.addresses.update(addr.id!, { city: 'San Pedro' })
    expect((await me.customer.addresses.list()).nodes[0]!.city).toBe('San Pedro')
    await me.customer.addresses.delete(addr.id!)
    expect((await me.customer.addresses.list()).nodes).toHaveLength(0)
    await expect(sf.customer.get()).rejects.toMatchObject({ status: 401 })
  })

  it('serves theme, pages, menus and articles', async () => {
    const theme = await pub.content.theme()
    expect(theme.tokens.primary).toMatch(/^#/)
    const home = (await pub.content.page('home'))!
    expect(home.sections.map((s) => s.type)).toEqual(['hero', 'product_grid', 'collection_list', 'rich_text', 'faq'])
    expect((await pub.content.page('home', { preview: 'tok' }))!.title).toContain('borrador')
    expect(await pub.content.page('terminos')).not.toBeNull()
    expect((await pub.content.menu('main'))!.items.length).toBeGreaterThan(0)
    expect((await pub.content.menu('footer'))!.items.length).toBe(3)
    const articles = await pub.content.articles()
    expect(articles.nodes).toHaveLength(2)
    expect(await pub.content.article(articles.nodes[0]!.handle)).not.toBeNull()
    expect(await pub.content.article('nope')).toBeNull()
    await expect(pub.content.articles({ first: 51 })).rejects.toMatchObject({ status: 400 })
    await expect(pub.content.articles({ first: 50 })).resolves.toBeTruthy()
  })
})
