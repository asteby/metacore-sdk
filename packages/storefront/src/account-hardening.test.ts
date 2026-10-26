/**
 * Adversarial cases of the buyer account (contract 1.8): answers of the REAL `storefront_customers` server (its
 * golden files in addons `contract/storefront/v1/golden/storefront_customers/`), garbage the client must survive, and
 * the privacy rules of the invoice download.
 */
import { describe, expect, it, vi } from 'vitest'
import { createStorefrontClient, nextAction, orderProgress } from './index.js'
import type { Order, Shipment } from './index.js'

const money = { amount: '10.00', currency_code: 'MXN' }
const order = (o: Partial<Order> = {}): Order => ({ id: 'o1', number: '1', status: 'accepted', created_at: '2026-08-01T10:00:00Z', total: money, lines: [], ...o })
const shipment = (s: Partial<Shipment> = {}): Shipment => ({ id: 's1', kind: 'outbound', status: 'in_transit', events: [], ...s })
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init })

/** Subset of golden `Order.pickup_ready.json` / `Order.invoice_billed.json` (server before `progress`). */
const goldenPickupReady = order({
  status: 'ready',
  payment_status: 'paid',
  delivery_method: 'pickup',
  pickup: { location_id: 'l1', name: 'Sucursal Centro Histórico', city: 'CDMX', ready_at: '2026-10-17T15:00:00Z', delivered_at: null },
  invoice: { status: 'not_requested', stage: 'not_requested', action: 'request', can_request: true },
})
const goldenBilled = order({
  status: 'shipped',
  payment_status: 'paid',
  delivery_method: null,
  tracking: 'GUIA-123',
  fulfillments: [{ status: 'dispatched', tracking: 'GUIA-123', shipped_at: null }],
  invoice: { status: 'billed', stage: 'issued', action: 'none', can_request: false, url: null, xml_url: null },
})

describe('real server answers (golden storefront_customers)', () => {
  it('a pickup order in `ready` is ready for pickup, not just paid', () => {
    const p = orderProgress(goldenPickupReady)
    expect(p.stage).toBe('ready_for_pickup')
    expect(p.steps.map((s) => `${s.key}:${s.state}`)).toEqual(['paid:done', 'preparing:done', 'ready_for_pickup:current', 'delivered:pending'])
    expect(nextAction(goldenPickupReady).kind).toBe('pickup')
  })

  it('a shipping order in `ready` (packed) is still being prepared', () => {
    expect(orderProgress(order({ status: 'ready', delivery_method: 'shipping' })).stage).toBe('preparing')
  })

  it('does not offer a download the server did not offer (action none, the file route is not live yet)', () => {
    expect(nextAction(goldenBilled).kind).toBe('none')
    // an older summary with no `action` at all still falls back to the stage
    expect(nextAction(order({ invoice: { status: 'issued', stage: 'issued' } })).kind).toBe('download_invoice')
  })
})

describe('server 1.8 fields', () => {
  it('next_action: null from a 1.8 server means nothing to offer, it is not re-derived', () => {
    expect(nextAction(order({ next_action: null, progress: { stage: 'paid', steps: [] }, invoice: { status: 'not_requested', can_request: true, action: 'request' } }))).toEqual({ kind: 'none', href: null, ref: null })
  })

  it('a malformed server progress never reaches the UI as garbage', () => {
    const p = orderProgress(order({ progress: { stage: 'in_transit', problem: 'boom' as never, steps: [null as never, { key: 'paid', state: 'done' }, { key: 7 as never, state: 'done' }] } }))
    expect(p.stage).toBe('in_transit')
    expect(p.problem).toBeNull()
    expect(p.steps).toEqual([{ key: 'paid', state: 'done' }])
  })
})

describe('legacy derivation edge cases', () => {
  it('a delivery problem on a shipment without events does not throw', () => {
    const o = order({ status: 'shipped', shipments: [{ id: 's1', kind: 'outbound', status: 'exception' } as never] })
    expect(() => orderProgress(o)).not.toThrow()
    expect(orderProgress(o).problem).toEqual({ code: 'delivery_exception', at: null })
  })

  it('a non-string status does not throw', () => {
    expect(() => orderProgress(order({ status: 42 as never }))).not.toThrow()
    expect(() => nextAction(order({ status: { x: 1 } as never }))).not.toThrow()
  })

  it('multi-shipment: one delivered and one still travelling is not a delivered order', () => {
    const o = order({ status: 'shipped', shipments: [shipment({ id: 'a', status: 'delivered' }), shipment({ id: 'b', status: 'in_transit' })] })
    expect(orderProgress(o).stage).toBe('in_transit')
    const all = order({ status: 'shipped', shipments: [shipment({ id: 'a', status: 'delivered' }), shipment({ id: 'b', status: 'delivered' })] })
    expect(orderProgress(all).stage).toBe('delivered')
    // a cancelled leg does not hold the order back
    const leg = order({ status: 'shipped', shipments: [shipment({ id: 'a', status: 'delivered' }), shipment({ id: 'b', status: 'cancelled' })] })
    expect(orderProgress(leg).stage).toBe('delivered')
  })

  it('a `shipped` status backed only by sandbox shipments is shown as preparing, never as shipped', () => {
    const o = order({ status: 'shipped', shipments: [shipment({ status: 'label_created', test_mode: true, environment: 'sandbox' })] })
    expect(orderProgress(o).stage).toBe('preparing')
    expect(nextAction(o).kind).not.toBe('track')
  })

  it('the paid step carries the payment date, not the order creation date', () => {
    const o = order({ status: 'accepted', payments: [{ method_label: 'OXXO', status: 'paid', amount: money, paid_at: '2026-08-03T12:00:00Z' }] })
    expect(orderProgress(o).steps[0]).toEqual({ key: 'paid', state: 'done', at: '2026-08-03T12:00:00Z' })
    expect(orderProgress(order({ status: 'accepted' })).steps[0]!.at).toBeNull()
  })

  it('never puts a sandbox invoice first as the download', () => {
    const o = order({
      status: 'delivered',
      invoice: { status: 'issued', stage: 'issued', action: 'download' },
      invoices: [{ id: 'inv_t', kind: 'invoice', status: 'issued', test_mode: true, environment: 'sandbox' }],
    })
    expect(nextAction(o).kind).not.toBe('download_invoice')
    const real = order({ ...o, invoices: [o.invoices![0]!, { id: 'inv_r', kind: 'invoice', status: 'issued', environment: 'production' }] })
    expect(nextAction(real)).toMatchObject({ kind: 'download_invoice', ref: 'inv_r' })
  })
})

describe('client: invoiceFile privacy and pendingPayments', () => {
  it('invoiceFile never follows a redirect (the buyer token would travel to another host)', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => json({ filename: 'f.pdf', content_type: 'application/pdf', content_base64: 'JVBERg==' }))
    const sf = createStorefrontClient({ baseUrl: 'https://ops.example.com/api/gw', token: 'sk_x', customerToken: 'ct_1', fetch })
    await sf.customer.invoiceFile('o1', 'i1', 'pdf', { redirect: 'follow' } as never)
    expect(fetch.mock.calls[0]![1]!.redirect).toBe('error')
  })

  it('invoiceFile rejects an answer that was redirected anyway (a fetch that ignores `redirect`)', async () => {
    const fetch = async () => {
      const res = json({ filename: 'f.pdf', content_type: 'application/pdf', content_base64: 'JVBERg==' })
      Object.defineProperty(res, 'redirected', { value: true })
      Object.defineProperty(res, 'url', { value: 'https://pac.example.net/cfdi/1.pdf' })
      return res
    }
    const sf = createStorefrontClient({ baseUrl: 'https://ops.example.com/api/gw', token: 'sk_x', customerToken: 'ct_1', fetch })
    await expect(sf.customer.invoiceFile('o1', 'i1', 'pdf')).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('ids cannot climb out of the route with dot segments', async () => {
    const fetch = vi.fn(async () => json({}))
    const sf = createStorefrontClient({ baseUrl: 'https://ops.example.com/api/gw', token: 'sk_x', customerToken: 'ct_1', fetch })
    for (const bad of ['..', '.', '%2e%2e'.replace(/%2e/g, '.')]) {
      await expect(sf.customer.invoiceFile(bad, 'i1', 'pdf')).rejects.toThrow(TypeError)
      await expect(sf.customer.invoiceFile('o1', bad, 'xml')).rejects.toThrow(TypeError)
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('pendingPayments sends first/after, and an OPS without the route (404) reads as "none"', async () => {
    const seen: string[] = []
    const fetch = async (url: string | URL | Request) => {
      seen.push(String(url))
      return new Response(JSON.stringify({ error: { code: 'not_found', message: 'route' } }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    }
    const sf = createStorefrontClient({ baseUrl: 'https://ops.example.com/api/gw', token: 'sk_x', customerToken: 'ct_1', fetch })
    expect(await sf.customer.pendingPayments({ first: 10, after: 'bzo1' })).toEqual({ nodes: [], page_info: { has_next_page: false, end_cursor: null }, total_count: 0 })
    expect(seen[0]).toBe('https://ops.example.com/api/gw/storefront/customer/pending-payments?first=10&after=bzo1')
  })

  it('pendingPayments: an expired session is a 401 StorefrontError, never an empty list', async () => {
    const fetch = async () => new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'session' } }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    const sf = createStorefrontClient({ baseUrl: 'https://ops.example.com/api/gw', token: 'sk_x', customerToken: 'ct_old', fetch })
    await expect(sf.customer.pendingPayments()).rejects.toMatchObject({ status: 401 })
  })
})
