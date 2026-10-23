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
    expect(stock.nodes).toMatchObject([{ sku: p.variants[0]!.sku, quantity_available: 15 }])
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
    expect(options).toMatchObject({ partial: false, unavailable: [] })
    expect(await pub.carts.paymentMethods(cart.id)).toEqual({ methods: [{ key: 'mock', kind: 'builtin', default: true }], market: null })
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
    // The placed checkout can be read back (order number resolves later in real OPS).
    await expect(sf.checkouts.get(result.checkout.id)).resolves.toEqual(result)
    await expect(sf.checkouts.get('chk_unknown')).resolves.toBeNull()
  })

  it('rejects over-stock and checkout without delivery', async () => {
    const p = (await sf.products.get('paraguas-compacto'))!
    await expect(sf.carts.create({ lines: [{ variant_id: p.variants[0]!.id, quantity: 4 }] })).rejects.toMatchObject({ status: 409, code: 'insufficient_stock' })
    const cart = await sf.carts.create({ lines: [{ variant_id: p.variants[0]!.id, quantity: 1 }] })
    await sf.carts.setBuyer(cart.id, { email: 'a@b.co' })
    await expect(sf.carts.checkout(cart.id, { payment_method: 'card', return_url: 'https://x' })).rejects.toMatchObject({ status: 422, field: 'delivery' })
  })
})

describe('mock availability', () => {
  it('publishes availability on variants and products; quantity only when low_stock', async () => {
    const umbrella = (await sf.products.get('paraguas-compacto'))! // stock 3 -> low
    expect(umbrella.variants[0]!.availability).toMatchObject({ status: 'low_stock', quantity: 3 })
    const socks = (await sf.products.get('calcetines-paquete'))! // stock 0
    expect(socks.variants[0]!.availability).toMatchObject({ status: 'out_of_stock', quantity: null, notify_available: true })
    expect(socks.availability?.status).toBe('out_of_stock')
    const shirt = (await sf.products.get('playera-basica'))! // stock 15
    expect(shirt.variants[0]!.availability).toMatchObject({ status: 'in_stock', quantity: null })
    expect(shirt.availability?.status).toBe('in_stock')
  })

  it('409 carries a quantity-free message and the affected lines; the cart is kept', async () => {
    const p = (await sf.products.get('paraguas-compacto'))!
    const v = p.variants[0]!
    const cart = await sf.carts.create({ lines: [{ variant_id: v.id, quantity: 2 }] })
    expect(cart.lines[0]!.problem).toBeNull()
    const err = await sf.carts.updateLines(cart.id, [{ id: cart.lines[0]!.id, quantity: 9 }]).catch((e) => e)
    expect(err).toMatchObject({ status: 409, code: 'insufficient_stock' })
    expect(err.message).not.toMatch(/\d/)
    expect(err.stockLines).toEqual([{ line_id: cart.lines[0]!.id, variant_id: v.id, sku: v.sku, status: 'low_stock', max_quantity: 3 }])
    expect((await sf.carts.get(cart.id))!.lines).toHaveLength(1)
  })

  it('flags a line that lost its stock between cart and checkout', async () => {
    const p = (await sf.products.get('llanta-225-45-r17-runflat'))! // stock 2
    const v = p.variants[0]!
    const a = await sf.carts.create({ lines: [{ variant_id: v.id, quantity: 2 }] })
    const b = await sf.carts.create({ lines: [{ variant_id: v.id, quantity: 2 }] })
    for (const c of [a, b]) {
      await sf.carts.setBuyer(c.id, { email: 'a@b.co' })
      await sf.carts.setDelivery(c.id, { method: 'pickup', branch_id: (await sf.shop.get()).branches[0]!.id })
    }
    await sf.carts.checkout(a.id, { payment_method: 'card', return_url: 'https://x' })
    const seen = (await sf.carts.get(b.id))!
    expect(seen.lines[0]!.problem).toEqual({ code: 'out_of_stock', max_quantity: 0 })
    await expect(sf.carts.checkout(b.id, { payment_method: 'card', return_url: 'https://x' })).rejects.toMatchObject({ code: 'insufficient_stock' })
  })

  it('accepts restock subscriptions idempotently and validates input', async () => {
    const sku = (await sf.products.get('calcetines-paquete'))!.variants[0]!.sku
    const input = { sku, email: 'a@b.co', locale: 'es-MX', consent: true } as const
    await expect(sf.restock.subscribe(input)).resolves.toEqual({ status: 'pending' })
    await expect(sf.restock.subscribe(input)).resolves.toEqual({ status: 'pending' })
    await expect(sf.restock.subscribe({ sku, locale: 'es', consent: true })).rejects.toMatchObject({ status: 400 })
    await expect(sf.restock.subscribe({ ...input, sku: 'NOPE' })).rejects.toMatchObject({ status: 404 })
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

describe('locations', () => {
  const sf = () => createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'pk_mock', fetch: createMockStorefront().fetch })

  it('lists the three example branches with structured fields', async () => {
    const { nodes } = await sf().locations.list()
    expect(nodes.map((l) => l.id)).toEqual(['br_centro', 'br_norte', 'br_occidente'])
    expect(nodes[0]).toMatchObject({ kind: 'store', timezone: 'America/Mexico_City', pickup: { enabled: true, fee: null, prep_days: 0 } })
    expect(nodes[0]!.opening_hours!.weekly.length).toBeGreaterThan(0)
    expect(nodes[0]!.distance_km).toBeUndefined()
  })

  it('orders by haversine distance from a postal code or a point, closest first', async () => {
    const client = sf()
    const byCp = await client.locations.list({ postal_code: '64000' })
    expect(byCp.nodes.map((l) => l.id)).toEqual(['br_norte', 'br_occidente', 'br_centro'])
    expect(byCp.nodes[0]!.distance_km).toBeLessThan(5)
    const near = await client.locations.nearest({ lat: 20.67, lng: -103.35 })
    expect(near.nodes.map((l) => l.id)).toEqual(['br_occidente', 'br_centro', 'br_norte'])
    expect(near.nodes[0]!.distance_km).toBeGreaterThan(0)
    // Unknown postal code: unordered, no distance.
    expect((await client.locations.list({ postal_code: '99999' })).nodes[0]!.distance_km).toBeUndefined()
  })

  it('rounds the point to 0.01 degrees like the server and rejects invalid points', async () => {
    const client = sf()
    const a = await client.locations.nearest({ lat: 19.43261, lng: -99.13321 })
    const b = await client.locations.nearest({ lat: 19.4349, lng: -99.1349 })
    expect(a.nodes.map((l) => l.distance_km)).toEqual(b.nodes.map((l) => l.distance_km))
    expect(() => client.locations.nearest({ lat: 0, lng: 0 })).toThrow(TypeError)
    await expect(client.request({ method: 'GET', path: '/storefront/locations/nearest', query: { lat: 'x', lng: '1' } })).rejects.toMatchObject({ status: 400 })
  })

  it('gets one branch, null when unknown, and marks nearest as private', async () => {
    const client = sf()
    expect((await client.locations.get('br_norte'))?.city).toBe('Monterrey')
    expect(await client.locations.get('nope')).toBeNull()
    const res = await createMockStorefront().fetch('https://mock.local/api/gw/storefront/locations/nearest?lat=19.4&lng=-99.1', { headers: { Authorization: 'Bearer pk_mock' } })
    expect(res.headers.get('cache-control')).toMatch(/no-store/)
  })

  it('only offers pickup at branches with pickup enabled and charges the fee', async () => {
    const sf2 = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'pk_mock', fetch: createMockStorefront().fetch })
    const product = (await sf2.products.list({ first: 1 })).nodes[0]!
    let cart = await sf2.carts.create({ lines: [{ variant_id: product.variants[0]!.id, quantity: 1 }] })
    await expect(sf2.carts.setDelivery(cart.id, { method: 'pickup', branch_id: 'br_occidente' })).rejects.toMatchObject({ status: 400 })
    cart = await sf2.carts.setDelivery(cart.id, { method: 'pickup', branch_id: 'br_norte' })
    expect(cart.cost.shipping?.amount).toBe('30.00')
  })
})

describe('mock: carrier rates and payment methods', () => {
  it('serves the given rates (24 h deadline) and charges the chosen one', async () => {
    const m = createMockStorefront({
      shippingRates: [{ id: 'fx', title: 'Standard Overnight', carrier: 'fedex', cost: { amount: '108.82', currency_code: 'MXN' }, eta: null, eta_days_min: 4, eta_days_max: 4 }],
      paymentMethods: [{ key: 'mercadopago', kind: 'provider', default: true, options: [{ key: 'cash', redirect: false }] }],
    })
    const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: m.fetch })
    const cart = await sf.carts.create({ lines: [] })
    const opts = await sf.carts.deliveryOptions(cart.id)
    expect(opts.rates.map((r) => r.carrier)).toEqual(['fedex'])
    expect(Date.parse(opts.rates[0]!.expires_at!)).toBeGreaterThan(Date.now())
    const pm = await sf.carts.paymentMethods(cart.id)
    expect(pm.methods[0]!.key).toBe('mercadopago')
  })
})
