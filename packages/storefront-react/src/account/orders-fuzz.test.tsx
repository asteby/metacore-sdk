// @vitest-environment happy-dom
// Server data is open and sometimes partial (`degraded`, older OPS, a carrier that sends anything): every order screen
// must render SOMETHING safe for any shape, never throw. Seeded random shapes, so a failure is reproducible.
import { describe, expect, it } from 'vitest'
import { cloneElement } from 'react'
import { renderToString } from 'react-dom/server'
import { InvoiceList, NextActionBar, OrderCard, OrderList, OrderProgress, OrderStatusBadge, PaymentSummary, PendingPaymentCard, PendingPaymentList, RefundList, ShipmentCard } from './index.js'
import { renderVoucherDocument } from './voucher-document.js'
import { voucherOf } from './voucher.js'

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SCALARS: unknown[] = [undefined, null, 0, -1, NaN, Infinity, '', ' ', 'x', '__proto__', 'constructor', 'toString', 'hasOwnProperty', true, false, '<img src=x onerror=alert(1)>', 'javascript:alert(1)', '2026-13-45', '2026-08-16', '2026-08-16T10:00:00Z', 'ñ'.repeat(500), {}, [], [null], { amount: 'abc', currency_code: 'ZZZZ' }, { amount: '10', currency_code: 'MXN' }]

function shape(r: () => number, keys: string[], nested: Record<string, (r: () => number) => unknown> = {}): Record<string, unknown> {
  const o: Record<string, unknown> = {}
  for (const k of keys) {
    const roll = r()
    if (roll < 0.15) continue
    o[k] = nested[k] && roll < 0.6 ? nested[k]!(r) : SCALARS[Math.floor(r() * SCALARS.length)]
  }
  return o
}
const list = (f: (r: () => number) => unknown) => (r: () => number) => (r() < 0.2 ? SCALARS[Math.floor(r() * SCALARS.length)] : Array.from({ length: Math.floor(r() * 4) }, () => (r() < 0.15 ? SCALARS[Math.floor(r() * SCALARS.length)] : f(r))))

const event = (r: () => number) => shape(r, ['id', 'status', 'description', 'location', 'occurred_at', 'source'])
const shipment = (r: () => number) => shape(r, ['id', 'number', 'kind', 'status', 'environment', 'test_mode', 'carrier', 'carrier_logo_key', 'service', 'tracking_number', 'tracking_url', 'shipped_at', 'delivered_at', 'promised_by', 'label_url', 'events', 'map'], { events: list(event) })
const invoiceDoc = (r: () => number) => shape(r, ['id', 'status', 'kind', 'total', 'issued_at', 'series', 'folio', 'folio_number', 'related_to', 'test_mode', 'environment', 'stage', 'action'])
const step = (r: () => number) => shape(r, ['key', 'state', 'at'])
const progress = (r: () => number) => shape(r, ['stage', 'problem', 'steps'], { steps: list(step), problem: (rr) => shape(rr, ['code', 'at']) })
const order = (r: () => number) =>
  shape(r, ['id', 'number', 'status', 'created_at', 'total', 'lines', 'invoice', 'delivery_method', 'payment_status', 'progress', 'next_action', 'shipments', 'shipments_summary', 'invoices', 'payments', 'refunds', 'degraded'], {
    shipments: list(shipment),
    invoices: list(invoiceDoc),
    progress,
    next_action: (rr) => shape(rr, ['kind', 'href', 'ref']),
    shipments_summary: (rr) => shape(rr, ['count', 'status', 'carrier', 'tracking_url']),
    lines: list((rr) => shape(rr, ['quantity', 'title'])),
    invoice: (rr) => shape(rr, ['stage', 'action', 'can_request', 'folio']),
  })
const voucher = (r: () => number) => shape(r, ['provider', 'method', 'reference', 'barcode', 'clabe', 'voucher_url', 'instructions', 'expires_at', 'amount'])
const pending = (r: () => number) => shape(r, ['id', 'number', 'status', 'created_at', 'total', 'expires_at', 'payment'], { payment: voucher })

const RUNS = 400

describe('order screens never throw on any server shape', () => {
  it.each([
    ['ShipmentCard', (r: () => number) => <ShipmentCard shipment={shipment(r) as never} testMode={r() < 0.5 ? 'mark' : 'hide'} renderMap={() => <i />} renderCarrierMark={() => <b />} />],
    ['OrderProgress', (r: () => number) => <OrderProgress order={order(r) as never} variant={r() < 0.5 ? 'compact' : 'full'} />],
    ['OrderProgress(progress)', (r: () => number) => <OrderProgress progress={progress(r) as never} variant={r() < 0.5 ? 'compact' : 'full'} />],
    ['OrderStatusBadge', (r: () => number) => <OrderStatusBadge order={order(r) as never} />],
    ['NextActionBar', (r: () => number) => <NextActionBar order={order(r) as never} onAction={() => {}} />],
    ['OrderCard', (r: () => number) => <OrderCard order={{ id: 'o1', ...order(r) } as never} orderHref={() => '/o'} />],
    ['OrderList', (r: () => number) => <OrderList orders={list(order)(r) as never} orderHref={() => '/o'} />],
    ['InvoiceList', (r: () => number) => <InvoiceList invoices={list(invoiceDoc)(r) as never} summary={{} as never} renderSummary={() => <i />} fileHref={() => '/f'} testMode={r() < 0.5 ? 'mark' : 'hide'} />],
    ['RefundList', (r: () => number) => <RefundList refunds={list((rr) => shape(rr, ['id', 'amount', 'status', 'method_label', 'created_at', 'completed_at']))(r) as never} showEmpty />],
    ['PaymentSummary', (r: () => number) => <PaymentSummary payments={list((rr) => shape(rr, ['method_label', 'family', 'status', 'amount', 'paid_at']))(r) as never} />],
    ['PendingPaymentCard', (r: () => number) => <PendingPaymentCard payment={pending(r) as never} />],
    ['PendingPaymentList', (r: () => number) => <PendingPaymentList payments={list(pending)(r) as never} voucherHref={() => '/v'} />],
  ] as const)('%s', (_name, make) => {
    for (let seed = 1; seed <= RUNS; seed++) {
      const r = rng(seed)
      const el = make(r)
      for (const locale of ['es-MX', 'en-US']) {
        try {
          const html = renderToString(cloneElement(el, { locale } as never))
          expect(html).not.toMatch(/<img|<script|href="javascript:/i)
        } catch (err) {
          throw new Error(`seed ${seed} (${locale}): ${(err as Error).message}`)
        }
      }
    }
  })

  it('the printable voucher document', () => {
    for (let seed = 1; seed <= RUNS; seed++) {
      const v = voucherOf(pending(rng(seed)) as never)
      if (!v) continue
      try {
        const html = renderVoucherDocument(v, { locale: 'es-MX', printButton: true, nonce: 'n' })
        expect(html.match(/<script/g)?.length ?? 0).toBeLessThanOrEqual(1)
      } catch (err) {
        throw new Error(`seed ${seed}: ${(err as Error).message}`)
      }
    }
  })
})
