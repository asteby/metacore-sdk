import { beforeEach, describe, expect, it } from 'vitest'
import { createStorefrontClient, normalizeTrackingView, visibleTrackingShipments } from '../index.js'
import { MOCK_CUSTOMER_EMAIL, createMockStorefront } from './index.js'

const mock = createMockStorefront()
const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
beforeEach(() => mock.reset())

const raw = (body: unknown) =>
  mock.fetch('https://mock.local/api/gw/storefront/customer/track', { method: 'POST', headers: { Authorization: 'Bearer sk_mock', 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

describe('mock public tracking (contract track: { order_number, status, shipments[] })', () => {
  it('order + email of an order without a parcel yet answers 200 pending with no shipments', async () => {
    const res = await raw({ order_number: '0998', email: MOCK_CUSTOMER_EMAIL })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('private')
    expect(await res.json()).toEqual({ order_number: '0998', status: 'pending', shipments: [] })
    await expect(sf.tracking.lookup({ order_number: '#0998', email: MOCK_CUSTOMER_EMAIL.toUpperCase() })).resolves.toEqual({ status: 'found', tracking: { order_number: '0998', status: 'pending', shipments: [] } })
  })

  it('order + email of a shipped order lists its shipment with scans newest first and no label', async () => {
    const res = await sf.tracking.lookup({ order_number: '0999', email: MOCK_CUSTOMER_EMAIL })
    expect(res.status).toBe('found')
    if (res.status !== 'found') return
    expect(res.tracking.order_number).toBe('0999')
    expect(res.tracking.status).toBe('in_transit')
    expect(res.tracking.shipments).toHaveLength(1)
    const s = res.tracking.shipments[0]!
    expect(s).toMatchObject({ id: 'shp_seed_1', carrier: 'Estafeta', tracking_number: '8012345678', label_url: null })
    expect(s.events.map((e) => e.id)).toEqual(['evt_3', 'evt_2', 'evt_1'])
    expect(s.map?.path?.length).toBe(1)
    const json = JSON.stringify(res.tracking)
    for (const leak of ['Ana', 'Prueba', '76000', '"total"', '"lines"']) expect(json).not.toContain(leak)
  })

  it('by guide answers only that shipment and no order number', async () => {
    const res = await sf.tracking.lookup({ tracking_number: '8012345678' })
    expect(res.status).toBe('found')
    if (res.status === 'found') expect(res.tracking).toMatchObject({ order_number: null, status: 'in_transit', shipments: [{ tracking_number: '8012345678' }] })
  })

  it('drops sandbox shipments: an order whose only parcel is a test reads as pending', async () => {
    const res = await sf.tracking.lookup({ order_number: '0997', email: MOCK_CUSTOMER_EMAIL })
    expect(res).toEqual({ status: 'found', tracking: { order_number: '0997', status: 'pending', shipments: [] } })
  })

  it('every miss is the same not_found: wrong email, unknown order, unknown guide, pickup order', async () => {
    for (const input of [
      { order_number: '0998', email: 'otra@example.com' },
      { order_number: 'NO-EXISTE', email: MOCK_CUSTOMER_EMAIL },
      { tracking_number: 'GUIA-FALSA' },
      { order_number: '0996', email: MOCK_CUSTOMER_EMAIL },
    ]) {
      await expect(sf.tracking.lookup(input)).resolves.toEqual({ status: 'not_found' })
    }
    expect((await raw({ order_number: '0998', email: 'otra@example.com' })).status).toBe(404)
    expect((await raw({})).status).toBe(400)
  })
})

describe('normalizeTrackingView / visibleTrackingShipments', () => {
  it('keeps the contract shape, drops malformed shipments and rejects what is not a tracking answer', () => {
    expect(normalizeTrackingView({ order_number: 'SO-1', status: 'pending', shipments: [] })).toEqual({ order_number: 'SO-1', status: 'pending', shipments: [] })
    expect(normalizeTrackingView({ status: null, shipments: [null, 3, { id: 's', kind: 'outbound', status: 'delivered' }] })).toEqual({
      order_number: null,
      status: null,
      shipments: [{ id: 's', kind: 'outbound', status: 'delivered', events: [] }],
    })
    for (const bad of [null, undefined, 'x', [], { nope: true }, { shipments: 'no' }]) expect(normalizeTrackingView(bad)).toBeNull()
  })

  it('folds the flat shape into one outbound shipment and never keeps a label', () => {
    const v = normalizeTrackingView({ status: 'delivered', tracking_number: 'G1', label_url: 'https://x/secret.pdf', events: [{ id: 'e', status: 'delivered', occurred_at: '2026-11-01T00:00:00Z' }, 'junk'] })!
    expect(v.shipments).toHaveLength(1)
    expect(v.shipments[0]).toMatchObject({ id: 'G1', kind: 'outbound', status: 'delivered', label_url: null })
    expect(v.shipments[0]!.events).toHaveLength(1)
  })

  it('never lets a test shipment through', () => {
    const shipments = [
      { id: 'a', kind: 'outbound', status: 'in_transit', events: [], test_mode: true },
      { id: 'b', kind: 'outbound', status: 'in_transit', events: [], environment: 'sandbox' },
      { id: 'c', kind: 'outbound', status: 'in_transit', events: [] },
    ]
    expect(visibleTrackingShipments({ shipments }).map((s) => s.id)).toEqual(['c'])
    expect(visibleTrackingShipments(null)).toEqual([])
  })
})
