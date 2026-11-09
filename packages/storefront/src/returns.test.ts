import { describe, expect, it } from 'vitest'
import { DEFAULT_RETURN_REASON, RETURN_NOTES_MAX, RETURN_REASONS, isReturnReason, orderDeliveredAt, returnEligibility, returnIneligibleMessage, returnMessages, returnReasonLabel, returnableLines } from './index.js'
import type { Order, OrderLine, Shipment } from './index.js'

const money = { amount: '10.00', currency_code: 'MXN' }
const line = (l: Partial<OrderLine> = {}): OrderLine => ({ title: 'Balata', variant_title: null, sku: 'BC-1', quantity: 2, unit: money, total: money, image: null, ...l })
const order = (o: Partial<Order> = {}): Order => ({ id: 'o1', number: '1', status: 'delivered', created_at: '2026-08-01T10:00:00Z', total: money, lines: [line()], ...o })
const shipment = (s: Partial<Shipment> = {}): Shipment => ({ id: 's1', kind: 'outbound', status: 'delivered', events: [], ...s })
const delivered = (at: string | null) => ({ stage: 'delivered', steps: [{ key: 'paid', state: 'done' }, { key: 'delivered', state: 'done', at }] })
const DAY = 86_400_000
const T0 = Date.parse('2026-09-01T12:00:00Z')

describe('returnableLines', () => {
  it('lists sku, title and max quantity; skips lines with no SKU or a non-whole quantity; merges repeated SKUs', () => {
    const lines = [line(), line({ sku: null, title: 'Sin sku' }), line({ sku: 'X', quantity: 0 }), line({ sku: 'Y', quantity: 1.5 }), line({ sku: ' BC-1 ', quantity: 1 }), line({ sku: 'Z', title: 'Disco', variant_title: 'Delantero', quantity: 3 }), null, 'x'] as unknown as OrderLine[]
    expect(returnableLines(order({ lines }))).toEqual([
      { sku: 'BC-1', title: 'Balata', variantTitle: null, maxQuantity: 3 },
      { sku: 'Z', title: 'Disco', variantTitle: 'Delantero', maxQuantity: 3 },
    ])
  })
  it('drops the placeholder variant and survives garbage', () => {
    expect(returnableLines(order({ lines: [line({ variant_title: 'Default Title' })] }))[0]!.variantTitle).toBeNull()
    expect(returnableLines(null)).toEqual([])
    expect(returnableLines({ lines: 'nope' as never })).toEqual([])
  })
})

describe('returnEligibility', () => {
  it('says why an order is not returnable', () => {
    expect(returnEligibility(order({ status: 'shipped', shipments: [shipment({ status: 'in_transit' })] }))).toEqual({ eligible: false, reason: 'not_delivered' })
    expect(returnEligibility(order({ status: 'pending_payment' }))).toEqual({ eligible: false, reason: 'not_delivered' })
    expect(returnEligibility(order({ status: 'cancelled' }))).toEqual({ eligible: false, reason: 'cancelled' })
    expect(returnEligibility(order({ status: 'refunded' }))).toEqual({ eligible: false, reason: 'refunded' })
    expect(returnEligibility(order({ lines: [line({ sku: null })] }))).toEqual({ eligible: false, reason: 'no_lines' })
  })

  it('is eligible WITHOUT a deadline when the contract carries no delivery date (nothing is invented)', () => {
    expect(returnEligibility(order(), { returnsDays: 30, now: T0 })).toEqual({ eligible: true })
    expect(returnEligibility(order({ progress: delivered(null) }), { returnsDays: 30, now: T0 })).toEqual({ eligible: true })
  })

  it('is eligible with no deadline when the store gives no window', () => {
    expect(returnEligibility(order({ progress: delivered('2020-01-01T00:00:00Z') }), { now: T0 })).toEqual({ eligible: true })
  })

  it('reads the delivery date from progress, then shipments, then pickup', () => {
    const at = new Date(T0 - 10 * DAY).toISOString()
    expect(orderDeliveredAt(order({ progress: delivered(at) }))).toBe(Date.parse(at))
    const a = new Date(T0 - 12 * DAY).toISOString()
    const now = new Date(T0).toISOString()
    expect(orderDeliveredAt(order({ shipments: [shipment({ delivered_at: a }), shipment({ id: 's2', delivered_at: at }), shipment({ id: 's3', kind: 'return', delivered_at: now }), shipment({ id: 's4', test_mode: true, delivered_at: now })] }))).toBe(Date.parse(at))
    expect(orderDeliveredAt(order({ delivery_method: 'pickup', pickup: { delivered_at: at } }))).toBe(Date.parse(at))
    expect(orderDeliveredAt(order())).toBeNull()
  })

  it('opens the window from delivery and closes it exactly at returnsDays', () => {
    const at = new Date(T0 - 10 * DAY).toISOString()
    const o = order({ progress: delivered(at) })
    expect(returnEligibility(o, { returnsDays: 30, now: T0 })).toEqual({ eligible: true, deadline: new Date(T0 + 20 * DAY).toISOString() })
    expect(returnEligibility(o, { returnsDays: 10, now: T0 })).toEqual({ eligible: true, deadline: new Date(T0).toISOString() })
    expect(returnEligibility(o, { returnsDays: 10, now: new Date(T0 + 1) })).toEqual({ eligible: false, reason: 'window_expired', deadline: new Date(T0).toISOString() })
  })

  it('falls back to the warranty window and flags it', () => {
    const o = order({ progress: delivered(new Date(T0 - 40 * DAY).toISOString()) })
    expect(returnEligibility(o, { returnsDays: 30, warrantyDays: 365, now: T0 })).toEqual({ eligible: true, deadline: new Date(T0 + 325 * DAY).toISOString(), warrantyOnly: true })
    expect(returnEligibility(o, { warrantyDays: 365, now: T0 })).toEqual({ eligible: true, deadline: new Date(T0 + 325 * DAY).toISOString() })
    expect(returnEligibility(o, { returnsDays: 30, warrantyDays: 35, now: T0 })).toEqual({ eligible: false, reason: 'window_expired', deadline: new Date(T0 - 5 * DAY).toISOString() })
  })

  it('ignores a bad window and never throws on a bad date', () => {
    expect(returnEligibility(order({ progress: delivered('not-a-date') }), { returnsDays: 30, now: T0 })).toEqual({ eligible: true })
    expect(returnEligibility(order({ progress: delivered(new Date(T0).toISOString()) }), { returnsDays: Number.NaN, warrantyDays: -1, now: T0 })).toEqual({ eligible: true })
  })
})

describe('return messages', () => {
  it('speaks es-MX by default and en-US on request, with overrides', () => {
    expect(returnMessages('es-MX')['form.submit']).toBe('Solicitar devolución')
    expect(returnMessages('en-US')['form.submit']).toBe('Request return')
    expect(returnMessages(undefined, { 'form.submit': 'Enviar', nope: 'x' } as never)['form.submit']).toBe('Enviar')
    expect(returnIneligibleMessage('window_expired', 'en')).toMatch(/period/)
    expect(returnReasonLabel('warranty', 'es-MX')).toBe('Garantía')
    expect(returnReasonLabel('weird', 'es-MX')).toBe(returnReasonLabel(DEFAULT_RETURN_REASON, 'es-MX'))
  })
  it('both catalogs have the same keys; reasons are the four the API accepts', () => {
    expect(Object.keys(returnMessages('en')).sort()).toEqual(Object.keys(returnMessages('es')).sort())
    expect([...RETURN_REASONS]).toEqual(['defective', 'not_wanted', 'wrong_item', 'warranty'])
    expect(isReturnReason('warranty')).toBe(true)
    expect(isReturnReason('other')).toBe(false)
    expect(RETURN_NOTES_MAX).toBe(500)
  })
})
