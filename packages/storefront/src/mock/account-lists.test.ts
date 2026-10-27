import { describe, expect, it } from 'vitest'
import { createStorefrontClient, StorefrontError } from '../index.js'
import { MOCK_CUSTOMER_EMAIL, createMockStorefront } from './index.js'

async function buyer(syntheticOrders = 0) {
  const mock = createMockStorefront({ syntheticOrders })
  const base = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
  await base.customer.requestOtp({ email: MOCK_CUSTOMER_EMAIL })
  const session = await base.customer.createSession({ email: MOCK_CUSTOMER_EMAIL, code: mock.otpCode })
  return { me: base.withCustomerToken(session.token), mock }
}

describe('mock account lists (contract 1.19)', () => {
  it('pages the orders by cursor, forward and back, with the total', async () => {
    const { me } = await buyer(300)
    const first = await me.customer.orders.list({ first: 10 })
    expect(first.nodes).toHaveLength(10)
    expect(first.total_count).toBeGreaterThanOrEqual(300)
    expect(first.page_info).toMatchObject({ has_next_page: true, has_previous_page: false })
    const seen = new Set(first.nodes.map((o) => o.id))
    let page = first
    let pages = 1
    while (page.page_info.has_next_page) {
      page = await me.customer.orders.list({ first: 10, after: page.page_info.end_cursor })
      for (const o of page.nodes) {
        expect(seen.has(o.id)).toBe(false)
        seen.add(o.id)
      }
      pages++
    }
    expect(seen.size).toBe(first.total_count)
    expect(pages).toBe(Math.ceil(first.total_count! / 10))
    // back from the last page
    const back = await me.customer.orders.list({ first: 10, before: page.nodes.length ? page.page_info.start_cursor : null })
    expect(back.nodes).toHaveLength(10)
    expect(back.page_info.has_next_page).toBe(true)
  })

  it('filters by status, delivery method, invoice, dates and exact number', async () => {
    const { me } = await buyer(60)
    const cancelled = await me.customer.orders.list({ first: 50, status: 'cancelled' })
    expect(cancelled.nodes.length).toBeGreaterThan(0)
    expect(cancelled.nodes.every((o) => o.status === 'cancelled')).toBe(true)
    expect(cancelled.total_count).toBeUndefined()
    const pickup = await me.customer.orders.list({ first: 50, delivery_method: 'pickup' })
    expect(pickup.nodes.every((o) => o.delivery_method === 'pickup')).toBe(true)
    const withInvoice = await me.customer.orders.list({ first: 50, has_invoice: true })
    expect(withInvoice.nodes.length).toBeGreaterThan(0)
    const one = await me.customer.orders.list({ q: '#s0007' })
    expect(one.nodes.map((o) => o.number)).toEqual(['S0007'])
    const none = await me.customer.orders.list({ from: '2030-01-01' })
    expect(none.nodes).toHaveLength(0)
    expect(none.page_info.has_next_page).toBe(false)
    const range = await me.customer.orders.list({ first: 50, from: '2026-07-31', to: '2026-08-01' })
    expect(range.nodes.length).toBeGreaterThan(0)
    expect(range.nodes.every((o) => o.created_at >= '2026-07-31' && o.created_at < '2026-08-02')).toBe(true)
  })

  it('refuses a bad limit, a bad cursor and both cursors', async () => {
    const { me } = await buyer()
    for (const params of [{ first: 101 }, { first: 0 }, { after: 'garbage' }, { before: '!!' }, { after: 'a', before: 'b' }]) {
      await expect(me.customer.orders.list(params)).rejects.toMatchObject({ status: 400 })
    }
    await expect(me.customer.orders.list({ first: 101 })).rejects.toBeInstanceOf(StorefrontError)
    expect((await me.customer.orders.list({ first: 100 })).nodes).toHaveLength(Math.min(50, (await me.customer.orders.list({ first: 100 })).total_count!))
  })

  it('serves invoices and shipments as light list nodes', async () => {
    const { me } = await buyer(60)
    const inv = await me.customer.invoices.list({ first: 5 })
    expect(inv.nodes.length).toBeGreaterThan(0)
    for (const n of inv.nodes) {
      expect(n.invoices.length).toBeGreaterThan(0)
      expect(Object.keys(n).sort()).toEqual(['invoices', 'order'])
    }
    const shp = await me.customer.shipments.list({ first: 5 })
    expect(shp.nodes.length).toBeGreaterThan(0)
    for (const n of shp.nodes) {
      expect(Object.keys(n).sort()).toEqual(['order', 'service', 'shipments', 'stage'])
      for (const s of n.shipments) expect(s.events).toEqual([])
    }
    const delivered = await me.customer.shipments.list({ first: 50, status: 'delivered' })
    expect(delivered.nodes.every((n) => n.shipments.some((s) => s.status === 'delivered'))).toBe(true)
  })

  it('keeps the callable form of orders working', async () => {
    const { me } = await buyer()
    const list = await me.customer.orders({ first: 2 })
    expect(list.nodes).toHaveLength(2)
  })
})
