import { describe, expect, it } from 'vitest'
import { createStorefrontClient, StorefrontError } from './index.js'

// An OPS older than contract 1.19 has no /customer/invoices or /customer/shipments (404) and ignores the new parameters.
function oldOps(onCall?: (url: URL) => void) {
  const order = (id: string, extra: Record<string, unknown> = {}) => ({ id, number: id.toUpperCase(), status: 'shipped', created_at: '2026-01-01T00:00:00Z', total: { amount: '1.00', currency_code: 'MXN' }, lines: [], ...extra })
  const detail: Record<string, unknown> = {
    a: order('a', { invoice: { stage: 'issued' }, invoices: [{ id: 'inv-a', kind: 'invoice', status: 'issued' }], shipments: [{ id: 's-a', status: 'in_transit' }], progress: { stage: 'in_transit' }, delivery_method: 'shipping' }),
    b: order('b', { invoice: { stage: 'not_requested' }, delivery_method: 'shipping', shipments: [] }),
    c: order('c', { invoice: { stage: 'issued' }, invoices: [{ id: 'inv-c', kind: 'invoice', status: 'issued' }], delivery_method: 'pickup' }),
  }
  const fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    onCall?.(url)
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    if (/\/customer\/(invoices|shipments)$/.test(url.pathname)) return json(404, { error: { code: 'not_found', message: 'no route' } })
    if (url.pathname.endsWith('/customer/orders')) return json(200, { nodes: ['a', 'b', 'c'].map((id) => ({ ...(detail[id] as object), invoices: undefined, shipments: undefined })), page_info: { has_next_page: true, end_cursor: 'cur' } })
    const m = url.pathname.match(/\/customer\/orders\/(\w+)$/)
    if (m) return detail[m[1]!] ? json(200, detail[m[1]!]) : json(404, { error: { code: 'not_found', message: 'x' } })
    return json(404, {})
  }) as typeof globalThis.fetch
  return createStorefrontClient({ baseUrl: 'https://ops.test/api/gw', token: 'sk_x', fetch }).withCustomerToken('tok')
}

describe('account lists on an OPS without the 1.19 routes', () => {
  it('builds the invoices list from one page of orders and the details of those that can have an invoice', async () => {
    const calls: string[] = []
    const me = oldOps((u) => calls.push(u.pathname))
    const page = await me.customer.invoices.list({ first: 3 })
    expect(page.nodes.map((n) => n.order.number)).toEqual(['A', 'C'])
    expect(page.nodes[0]!.invoices[0]!.id).toBe('inv-a')
    expect(page.page_info).toEqual({ has_next_page: true, end_cursor: 'cur' })
    expect(calls.filter((p) => /orders\/\w$/.test(p))).toHaveLength(2) // b has no invoice: its detail is not opened
  })

  it('builds the shipments list the same way and skips pickups', async () => {
    const page = await oldOps().customer.shipments.list({ first: 3 })
    expect(page.nodes.map((n) => n.order.number)).toEqual(['A'])
    expect(page.nodes[0]).toMatchObject({ stage: 'in_transit', service: null })
    expect(page.nodes[0]!.shipments).toHaveLength(1)
  })

  it('still throws on a 401', async () => {
    const fetch = (async () => new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'no' } }), { status: 401, headers: { 'content-type': 'application/json' } })) as typeof globalThis.fetch
    const me = createStorefrontClient({ baseUrl: 'https://ops.test/api/gw', token: 'sk_x', fetch }).withCustomerToken('t')
    await expect(me.customer.invoices.list()).rejects.toBeInstanceOf(StorefrontError)
  })
})
