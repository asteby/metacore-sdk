import { beforeEach, describe, expect, it } from 'vitest'
import { createStorefrontClient, invoiceFileBytes, StorefrontError } from '../index.js'
import { MOCK_CUSTOMER_EMAIL, createMockStorefront } from './index.js'

const mock = createMockStorefront()
const base = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
beforeEach(() => mock.reset())

async function buyer() {
  await base.customer.requestOtp({ email: MOCK_CUSTOMER_EMAIL })
  const session = await base.customer.createSession({ email: MOCK_CUSTOMER_EMAIL, code: mock.otpCode })
  return base.withCustomerToken(session.token)
}

describe('mock account (contract 1.8)', () => {
  it('lists orders as summaries and still starts at 1000', async () => {
    const me = await buyer()
    const list = await me.customer.orders({ first: 50 })
    expect(list.nodes[0]!.number).toBe('1000')
    expect(list.nodes.length).toBeGreaterThanOrEqual(5)
    for (const o of list.nodes) {
      expect(o.progress && o.next_action).toBeTruthy()
      for (const k of ['shipments', 'invoices', 'payments', 'refunds', 'shipping_address'] as const) expect(o[k]).toBeUndefined()
    }
    expect(list.nodes.find((o) => o.id === 'ord_seed_shipped')!.shipments_summary).toMatchObject({ count: 1, status: 'in_transit', carrier: 'Estafeta' })
  })

  it('serves the detail with shipments, invoices with credit note, payments and refunds', async () => {
    const me = await buyer()
    const o = (await me.customer.order('ord_seed_shipped'))!
    expect(o.shipments![0]!.events.map((e) => e.id)).toEqual(['evt_3', 'evt_2', 'evt_1'])
    expect(o.shipments![0]!.label_url).toBeNull()
    expect(o.invoices!.map((d) => d.kind)).toEqual(['invoice', 'credit_note'])
    expect(o.refunds![0]!.status).toBe('completed')
    expect(o.payments![0]!.status).toBe('partially_refunded')
    expect(o.next_action).toMatchObject({ kind: 'track', href: 'https://rastreo.example.com/estafeta/8012345678' })
    expect(o.progress!.stage).toBe('in_transit')
  })

  it('hides the guide of a sandbox shipment and marks it', async () => {
    const me = await buyer()
    const s = (await me.customer.order('ord_seed_sandbox'))!.shipments![0]!
    expect(s).toMatchObject({ test_mode: true, environment: 'sandbox', tracking_number: null, tracking_url: null })
  })

  it('lists pending cash vouchers with the contract shape', async () => {
    const me = await buyer()
    const p = await me.customer.pendingPayments()
    expect(p.nodes.map((n) => [n.status, n.number, n.payment.method])).toEqual([['pending_payment', null, 'oxxo'], ['expired', null, 'spei']])
    expect(p.total_count).toBe(2)
  })

  it('downloads an invoice file as bytes, never as a URL, and 404s as null', async () => {
    const me = await buyer()
    const file = (await me.customer.invoiceFile('ord_seed_shipped', 'inv_seed_1', 'pdf'))!
    expect(file.content_type).toBe('application/pdf')
    expect(new TextDecoder().decode(invoiceFileBytes(file))).toContain('%PDF')
    expect(JSON.stringify(file)).not.toMatch(/https?:/)
    expect(await me.customer.invoiceFile('ord_seed_shipped', 'inv_nope', 'pdf')).toBeNull()
    expect(await me.customer.invoiceFile('ord_nope', 'inv_seed_1', 'xml')).toBeNull()
    await expect(me.customer.invoiceFile('ord_seed_shipped', 'inv_seed_1', 'exe' as never)).rejects.toThrow(TypeError)
  })

  it('needs a buyer session for every one of them', async () => {
    await expect(base.customer.pendingPayments()).rejects.toBeInstanceOf(StorefrontError)
    await expect(base.customer.invoiceFile('ord_seed_shipped', 'inv_seed_1', 'pdf')).rejects.toMatchObject({ status: 401 })
  })

  it('the demo orders sit below 1000, so the next checkout is still 1001', async () => {
    const me = await buyer()
    const before = (await me.customer.orders({ first: 50 })).nodes.map((o) => Number(o.number))
    expect(Math.max(...before)).toBe(1000)
  })
})
