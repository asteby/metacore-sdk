import { beforeEach, describe, expect, it } from 'vitest'
import { createStorefrontClient, type Cart } from '../index.js'
import { MOCK_CUSTOMER_EMAIL, MOCK_REGION_MX, createMockStorefront } from './index.js'

const mock = createMockStorefront()
const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })

beforeEach(() => mock.reset())

const FISICA = { tax_id: 'PEPJ800101AB3', legal_name: 'JUAN PEREZ PEREZ', tax_regime: '612', use: 'G03', postal_code: '06600' }

async function readyCart(): Promise<Cart> {
  const product = (await sf.products.get('playera-basica'))!
  let cart = await sf.carts.create({ lines: [{ variant_id: product.variants.find((v) => v.available_for_sale)!.id, quantity: 1 }] })
  cart = await sf.carts.setBuyer(cart.id, { email: 'comprador@example.com' })
  cart = await sf.carts.setDelivery(cart.id, { method: 'pickup', branch_id: 'br_centro' })
  return cart
}

async function signIn() {
  await sf.customer.requestOtp({ email: MOCK_CUSTOMER_EMAIL })
  const session = await sf.customer.createSession({ email: MOCK_CUSTOMER_EMAIL, code: '000000' })
  return sf.withCustomerToken(session.token)
}

describe('mock region', () => {
  it('serves the region with the identity document spec and the payment forms', async () => {
    const region = await sf.region()
    expect(region?.country_code).toBe('MX')
    expect(region?.fiscal_id?.documents?.[0]).toMatchObject({ kind: 'MX:csf', engine: 'rules@1', freshness_days: 90 })
    expect(region?.fiscal_id?.documents?.[0]?.discard_fields).toContain('curp')
    expect(region?.payment_methods?.map((m) => [m.code, m.fiscal_payment_form])).toEqual([['card', '04,28'], ['mercadopago', '06,04,28'], ['oxxo', '01'], ['spei', '03']])
  })

  it('answers null (404) when the organization has no region', async () => {
    const m = createMockStorefront({ region: null })
    const c = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: m.fetch })
    await expect(c.region()).resolves.toBeNull()
  })

  it('can serve another country', async () => {
    const m = createMockStorefront({ region: { ...MOCK_REGION_MX, country_code: 'ZZ', fiscal_id: undefined } })
    const c = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: m.fetch })
    expect((await c.region())?.country_code).toBe('ZZ')
  })

  it('reports what invoicing the store offers', async () => {
    expect((await sf.customer.capabilities()).invoicing).toEqual({
      available: true,
      countries: ['MX'],
      checkout: 'optional',
      post_purchase: true,
      window_days: 30,
      identity_documents: ['MX:csf'],
      online_verify: false,
    })
    const off = createMockStorefront({ customerCapabilities: { invoicing: { available: false, countries: [], checkout: 'off', post_purchase: false, identity_documents: [], online_verify: false } } })
    const c = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: off.fetch })
    expect((await c.customer.capabilities()).invoicing?.available).toBe(false)
  })
})

describe('carts.setInvoice', () => {
  it('stores a valid request and echoes it with the tax id masked', async () => {
    const cart = await readyCart()
    const next = await sf.carts.setInvoice(cart.id, { ...FISICA, document: { kind: 'MX:csf', document_id: '21030123456', source: 'pdf_client', qr_match: true } })
    expect(next.invoice).toMatchObject({ requested: true, legal_name: 'JUAN PEREZ PEREZ', country_code: 'MX', document_kind: 'MX:csf' })
    expect(next.invoice!.tax_id_masked).toMatch(/^PE\*{8}AB3$/)
    expect((await sf.carts.get(cart.id))!.invoice?.requested).toBe(true)
  })

  it('withdraws the request with null', async () => {
    const cart = await readyCart()
    await sf.carts.setInvoice(cart.id, FISICA)
    expect((await sf.carts.setInvoice(cart.id, null)).invoice).toBeNull()
  })

  it.each([
    ['invoice.tax_id', { ...FISICA, tax_id: 'NOPE' }],
    ['invoice.tax_id', { ...FISICA, tax_id: undefined }],
    ['invoice.legal_name', { ...FISICA, legal_name: ' ' }],
    ['invoice.tax_regime', { ...FISICA, tax_regime: '999' }],
    ['invoice.tax_regime', { ...FISICA, tax_regime: '601' }], // a company regime for a natural person's id
    ['invoice.postal_code', { ...FISICA, postal_code: '6600' }],
    ['invoice.use', { ...FISICA, use: undefined }],
    ['invoice.use', { ...FISICA, use: 'XX9' }],
    ['invoice.use', { ...FISICA, tax_regime: '605', use: 'G03' }], // 605 does not admit G03
  ])('answers 422 naming %s', async (field, invoice) => {
    const cart = await readyCart()
    await expect(sf.carts.setInvoice(cart.id, invoice)).rejects.toMatchObject({ status: 422, field })
  })

  it('accepts the Spanish aliases and the generic public id', async () => {
    const cart = await readyCart()
    await expect(sf.carts.setInvoice(cart.id, { rfc: 'XAXX010101000', razon_social: 'PUBLICO EN GENERAL', regimen: '616', uso_cfdi: 'S01', cp: '06600' })).resolves.toMatchObject({ invoice: { requested: true } })
  })

  it('accepts zip and cfdi_use, already in production use by some storefronts', async () => {
    const cart = await readyCart()
    await expect(
      sf.carts.setInvoice(cart.id, { rfc: 'PEPJ800101AB3', legal_name: 'JUAN PEREZ PEREZ', tax_regime: '612', cfdi_use: 'G03', zip: '06600' }),
    ).resolves.toMatchObject({ invoice: { requested: true } })
  })

  it('answers 404 for an unknown cart', async () => {
    await expect(sf.carts.setInvoice('nope', FISICA)).rejects.toMatchObject({ status: 404 })
  })

  it('answers 409 once the cart is an order', async () => {
    const cart = await readyCart()
    await sf.carts.checkout(cart.id, { payment_method: 'card', return_url: 'https://shop.example/ok' })
    await expect(sf.carts.setInvoice(cart.id, FISICA)).rejects.toMatchObject({ status: 409, code: 'already_checked_out' })
  })
})

describe('checkout with an invoice', () => {
  it('rejects an invalid inline invoice with 422 invoice.<field> BEFORE reserving stock', async () => {
    const cart = await readyCart()
    const sku = cart.lines[0]!.merchandise.sku!
    const before = (await sf.stock.get([sku])).nodes[0]
    await expect(sf.carts.checkout(cart.id, { payment_method: 'card', return_url: 'https://x', invoice: { ...FISICA, use: 'G03', tax_regime: '605' } })).rejects.toMatchObject({ status: 422, field: 'invoice.use' })
    expect((await sf.stock.get([sku])).nodes[0]).toEqual(before)
  })

  it('uses the invoice saved on the cart when the checkout brings none', async () => {
    const customer = await signIn()
    let cart = await readyCart()
    cart = await sf.carts.setBuyer(cart.id, { email: MOCK_CUSTOMER_EMAIL })
    await sf.carts.setInvoice(cart.id, FISICA)
    const res = await sf.carts.checkout(cart.id, { payment_method: 'card', return_url: 'https://x' })
    expect((await customer.customer.order(res.order.id))!.invoice).toMatchObject({ stage: 'awaiting_payment', requested: true })
  })

  it('withdrawing the cart invoice means the checkout asks for none', async () => {
    const customer = await signIn()
    let cart = await readyCart()
    cart = await sf.carts.setBuyer(cart.id, { email: MOCK_CUSTOMER_EMAIL })
    await sf.carts.setInvoice(cart.id, FISICA)
    await sf.carts.setInvoice(cart.id, null)
    const res = await sf.carts.checkout(cart.id, { payment_method: 'card', return_url: 'https://x' })
    expect((await customer.customer.order(res.order.id))!.invoice).toMatchObject({ stage: 'not_requested' })
  })

  it('walks the invoice of an order: awaiting payment -> queued once paid', async () => {
    const customer = await signIn()
    let cart = await readyCart()
    cart = await sf.carts.setBuyer(cart.id, { email: MOCK_CUSTOMER_EMAIL })
    await sf.carts.setInvoice(cart.id, FISICA)
    const res = await sf.carts.checkout(cart.id, { payment_method: 'card', return_url: 'https://x' })
    const order = (await customer.customer.order(res.order.id))!
    expect(order.invoice).toMatchObject({ stage: 'awaiting_payment', requested: true, can_request: false })
    await sf.checkouts.pay(res.checkout.id, { method: 'card', provider_data: { token: 'tok_OK' } }, { idempotencyKey: 'pay-1' })
    expect((await customer.customer.order(res.order.id))!.invoice).toMatchObject({ stage: 'queued', requested: true })
  })
})

describe('customer.requestInvoice', () => {
  it('409 awaiting_payment on an unpaid order, 422 for bad data, 202 once paid, then idempotent', async () => {
    const customer = await signIn()
    let cart = await readyCart()
    cart = await sf.carts.setBuyer(cart.id, { email: MOCK_CUSTOMER_EMAIL })
    const res = await sf.carts.checkout(cart.id, { payment_method: 'card', return_url: 'https://x' })
    expect((await customer.customer.order(res.order.id))!.invoice).toMatchObject({ stage: 'not_requested', can_request: false, blocked_reason: 'awaiting_payment' })
    await expect(customer.customer.requestInvoice(res.order.id, FISICA)).rejects.toMatchObject({ status: 409, code: 'awaiting_payment' })

    await sf.checkouts.pay(res.checkout.id, { method: 'card', provider_data: { token: 'tok_OK' } }, { idempotencyKey: 'pay-2' })
    expect((await customer.customer.order(res.order.id))!.invoice).toMatchObject({ stage: 'not_requested', can_request: true, action: 'request' })
    await expect(customer.customer.requestInvoice(res.order.id, { ...FISICA, tax_regime: '999' })).rejects.toMatchObject({ status: 422, field: 'invoice.tax_regime' })
    await expect(customer.customer.requestInvoice(res.order.id, FISICA)).resolves.toMatchObject({ status: 'requested', stage: 'queued' })
    expect((await customer.customer.order(res.order.id))!.invoice).toMatchObject({ stage: 'queued', can_request: false })
    await expect(customer.customer.requestInvoice(res.order.id, FISICA)).resolves.toMatchObject({ stage: 'queued' })
  })
})

describe('customer fiscal data', () => {
  it('saves, reads without the file hash, and deletes with fiscal: null', async () => {
    const customer = await signIn()
    expect((await customer.customer.get()).fiscal ?? null).toBeNull()
    const saved = await customer.customer.update({
      fiscal: { ...FISICA, document: { kind: 'MX:csf', document_id: '21030123456', sha256: 'ab'.repeat(32), source: 'pdf_client' } },
    })
    expect(saved.fiscal).toMatchObject({ country_code: 'MX', tax_id: 'PEPJ800101AB3', tax_regime: '612', invoice_use: 'G03', verification: { status: 'reviewed' } })
    expect(saved.fiscal?.document).toEqual({ kind: 'MX:csf', document_id: '21030123456', source: 'pdf_client' })
    expect(JSON.stringify(await customer.customer.get())).not.toContain('ab'.repeat(32))
    await expect(customer.customer.update({ fiscal: { ...FISICA, tax_regime: '601' } })).rejects.toMatchObject({ status: 422, field: 'fiscal.tax_regime' })
    expect((await customer.customer.update({ fiscal: null })).fiscal).toBeNull()
    expect((await customer.customer.get()).fiscal).toBeNull()
  })
})
