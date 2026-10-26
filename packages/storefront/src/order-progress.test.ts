import { describe, expect, it } from 'vitest'
import { groupInvoiceDocs, invoiceFileBytes, isTestInvoice, isTestShipment, nextAction, orderProgress, safeInvoiceFilename, safeTrackingUrl, shipmentsStatus, sortTrackingEvents } from './index.js'
import type { InvoiceDoc, Order, Shipment } from './index.js'

const money = { amount: '10.00', currency_code: 'MXN' }
const order = (o: Partial<Order> = {}): Order => ({ id: 'o1', number: '1', status: 'paid', created_at: '2026-08-01T10:00:00Z', total: money, lines: [], ...o })
const shipment = (s: Partial<Shipment> = {}): Shipment => ({ id: 's1', kind: 'outbound', status: 'in_transit', events: [], ...s })
const keys = (o: Order) => orderProgress(o).steps.map((s) => `${s.key}:${s.state}`)

describe('orderProgress', () => {
  it('returns the server progress untouched, even with a stage this SDK does not know', () => {
    const progress = { stage: 'brand_new_stage', steps: [{ key: 'teleport', state: 'levitating' }] }
    expect(orderProgress(order({ progress }))).toBe(progress)
  })

  it('derives a shipping timeline for servers without progress', () => {
    expect(keys(order({ status: 'paid' }))).toEqual(['paid:current', 'preparing:pending', 'shipped:pending', 'in_transit:pending', 'delivered:pending'])
    expect(orderProgress(order({ status: 'fulfilling' })).stage).toBe('preparing')
    expect(keys(order({ status: 'shipped', shipments: [shipment({ status: 'in_transit' })] }))).toEqual(['paid:done', 'preparing:done', 'shipped:done', 'in_transit:current', 'delivered:pending'])
    expect(keys(order({ status: 'delivered' }))).toEqual(['paid:done', 'preparing:done', 'shipped:done', 'in_transit:done', 'delivered:done'])
    expect(orderProgress(order({ status: 'fulfilled' })).stage).toBe('delivered')
  })

  it('derives the pickup variant', () => {
    expect(keys(order({ status: 'ready_for_pickup', delivery_method: 'pickup' }))).toEqual(['paid:done', 'preparing:done', 'ready_for_pickup:current', 'delivered:pending'])
  })

  it('has nothing to walk while it waits for payment or after it dies', () => {
    expect(keys(order({ status: 'pending_payment' })).every((k) => k.endsWith(':pending'))).toBe(true)
    expect(orderProgress(order({ status: 'cancelled' }))).toMatchObject({ stage: 'cancelled', steps: [] })
    expect(orderProgress(order({ status: 'refunded' }))).toMatchObject({ stage: 'refunded', steps: [] })
  })

  it('flags a delivery problem and a failed payment', () => {
    const p = orderProgress(order({ status: 'shipped', shipments: [shipment({ status: 'exception' })] }))
    expect(p.problem).toMatchObject({ code: 'delivery_exception' })
    expect(p.steps.some((s) => s.state === 'problem')).toBe(true)
    expect(orderProgress(order({ status: 'placed', payment_status: 'failed' })).problem).toEqual({ code: 'payment_failed' })
  })

  it('never shows a sandbox shipment as real progress', () => {
    const p = orderProgress(order({ status: 'paid', shipments: [shipment({ status: 'delivered', test_mode: true })] }))
    expect(p.stage).toBe('paid')
  })

  it('survives garbage in the legacy fields', () => {
    expect(() => orderProgress(order({ status: undefined as never, shipments: [null as never, 3 as never] }))).not.toThrow()
  })
})

describe('nextAction', () => {
  it('keeps the server action but only with an https href', () => {
    expect(nextAction(order({ next_action: { kind: 'track', href: 'https://t.example.com/x', ref: 's1' } }))).toEqual({ kind: 'track', href: 'https://t.example.com/x', ref: 's1' })
    expect(nextAction(order({ next_action: { kind: 'track', href: 'javascript:alert(1)' } })).href).toBeNull()
    expect(nextAction(order({ next_action: { kind: 'track', href: 'http://t.example.com' } })).href).toBeNull()
    expect(nextAction(order({ next_action: { kind: 'future_kind' } })).kind).toBe('future_kind')
  })

  it('derives it for older servers', () => {
    expect(nextAction(order({ status: 'pending_payment' })).kind).toBe('pay')
    expect(nextAction(order({ status: 'shipped', shipments: [shipment({ tracking_url: 'https://t.example.com/1' })] }))).toMatchObject({ kind: 'track', href: 'https://t.example.com/1', ref: 's1' })
    expect(nextAction(order({ status: 'shipped', shipments: [shipment({ tracking_url: 'https://t.example.com/1', test_mode: true })] })).kind).toBe('none')
    expect(nextAction(order({ status: 'ready_for_pickup', delivery_method: 'pickup' })).kind).toBe('pickup')
    expect(nextAction(order({ status: 'delivered', invoice: { status: 'issued', stage: 'issued', action: 'download' } })).kind).toBe('download_invoice')
    expect(nextAction(order({ status: 'delivered', invoice: { status: 'not_requested', can_request: true } })).kind).toBe('request_invoice')
    expect(nextAction(order({ status: 'cancelled' })).kind).toBe('none')
  })
})

describe('shipments', () => {
  it('sorts events newest first, bad dates last, and caps them', () => {
    const ev = (id: string, at: string) => ({ id, status: 'in_transit', occurred_at: at })
    expect(sortTrackingEvents([ev('a', '2026-01-01T00:00:00Z'), ev('b', 'garbage'), ev('c', '2026-03-01T00:00:00Z')]).map((e) => e.id)).toEqual(['c', 'a', 'b'])
    expect(sortTrackingEvents(Array.from({ length: 80 }, (_, i) => ev(String(i), `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}Z`)))).toHaveLength(50)
    expect(sortTrackingEvents(undefined)).toEqual([])
  })

  it('detects sandbox records and only trusts https links', () => {
    expect(isTestShipment({ test_mode: true })).toBe(true)
    expect(isTestShipment({ environment: 'sandbox' })).toBe(true)
    expect(isTestShipment({ test_mode: false, environment: 'production' })).toBe(false)
    expect(isTestInvoice({ test_mode: true })).toBe(true)
    expect(safeTrackingUrl('https://ok.example.com/a?b=1')).toBe('https://ok.example.com/a?b=1')
    for (const bad of ['http://x.com', 'javascript:1', 'data:text/html,x', 'https://u:p@x.com', '//x.com', null, 5]) expect(safeTrackingUrl(bad)).toBeNull()
  })

  it('reads the summary status, else the live shipments', () => {
    expect(shipmentsStatus(order({ shipments_summary: { count: 1, status: 'delivered' } }))).toBe('delivered')
    expect(shipmentsStatus(order({ shipments: [shipment({ status: 'exception' })] }))).toBe('exception')
    expect(shipmentsStatus(order())).toBeNull()
  })
})

describe('invoice documents', () => {
  const doc = (d: Partial<InvoiceDoc>): InvoiceDoc => ({ id: 'i', status: 'issued', kind: 'invoice', ...d })
  it('groups credit notes under their invoice and keeps orphans', () => {
    const { groups, orphans } = groupInvoiceDocs([doc({ id: 'a' }), doc({ id: 'n1', kind: 'credit_note', related_to: 'a' }), doc({ id: 'n2', kind: 'credit_note', related_to: 'zz' }), doc({ id: 'b' })])
    expect(groups.map((g) => [g.invoice.id, g.creditNotes.map((c) => c.id)])).toEqual([['a', ['n1']], ['b', []]])
    expect(orphans.map((o) => o.id)).toEqual(['n2'])
    expect(groupInvoiceDocs(undefined)).toEqual({ groups: [], orphans: [] })
  })

  it('decodes a file and refuses garbage', () => {
    expect([...invoiceFileBytes({ content_base64: btoa('%PDF') })]).toEqual([37, 80, 68, 70])
    expect(() => invoiceFileBytes({ content_base64: 'not base64!' })).toThrow(TypeError)
  })

  it('makes safe download filenames', () => {
    expect(safeInvoiceFilename('../../etc/passwd')).toBe('passwd')
    expect(safeInvoiceFilename('factura "1"\r\n.pdf')).toBe('factura_1_.pdf')
    expect(safeInvoiceFilename(undefined)).toBe('factura')
    expect(safeInvoiceFilename('...')).toBe('factura')
  })
})
