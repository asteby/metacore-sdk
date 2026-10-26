// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import axe from 'axe-core'
import { renderToString } from 'react-dom/server'
import type { Order } from '@asteby/storefront'
import { InvoiceList, NextActionBar, OrderList, OrderProgress, OrderStatusBadge, PaymentSummary, PendingPaymentList, RefundList, ShipmentCard } from './index.js'
import { demo } from './orders-fixtures.js'

afterEach(cleanup)
// Contrast is judged per store with its own tokens (the SDK ships none); everything else is on.
const AXE = { rules: { 'color-contrast': { enabled: false } } }

function Detail({ order, locale }: { order: Order; locale?: string }) {
  const loc = locale ? { locale } : {}
  return (
    <main>
      <h1>Pedido {order.number}</h1>
      <OrderStatusBadge order={order} {...loc} />
      <NextActionBar order={order} hrefFor={(a) => (a.kind === 'download_invoice' ? '/facturas' : null)} {...loc} />
      <OrderProgress order={order} {...loc} />
      {(order.shipments ?? []).map((s) => (
        <ShipmentCard key={s.id} shipment={s} testMode="mark" headingLevel={2} {...loc} />
      ))}
      <InvoiceList invoices={order.invoices} summary={order.invoice} degraded={order.degraded?.includes('invoices')} onRetry={() => {}} fileHref={(d, k) => `/f/${d.id}.${k}`} headingLevel={2} {...loc} />
      <PaymentSummary payments={order.payments} headingLevel={2} {...loc} />
      <RefundList refunds={order.refunds} headingLevel={2} {...loc} />
    </main>
  )
}

describe('a whole order page', () => {
  it('has no accessibility violations for any demo order, in es and en', async () => {
    const { list, detail } = await demo()
    for (const o of list.nodes) {
      const full = await detail(o.id)
      for (const locale of [undefined, 'en']) {
        const r = render(<Detail order={full} {...(locale ? { locale } : {})} />)
        const result = await axe.run(r.container, AXE)
        expect(result.violations.map((v) => `${full.number} ${locale ?? 'es'}: ${v.id}`)).toEqual([])
        r.unmount()
      }
    }
  })

  it('has no accessibility violations on the account page (pending vouchers + order list)', async () => {
    const { list, pending } = await demo()
    const r = render(
      <main>
        <h1>Mis pedidos</h1>
        <PendingPaymentList payments={pending} />
        <h2>Pedidos</h2>
        <OrderList orders={list.nodes} orderHref={(o) => `/p/${o.id}`} headingLevel={3} />
      </main>,
    )
    expect((await axe.run(r.container, AXE)).violations).toEqual([])
  })

  it('renders on the server with no window and no hydration-unsafe ids', async () => {
    const { list, detail, pending } = await demo()
    const html = renderToString(
      <div>
        <PendingPaymentList payments={pending} />
        <OrderList orders={list.nodes} orderHref={(o) => `/p/${o.id}`} />
        <Detail order={await detail('ord_seed_shipped')} />
      </div>,
    )
    expect(html).toContain('data-sf-orders')
    expect(html).toContain('data-sf-shipment')
    expect(html).not.toMatch(/pac\.example|label_url/)
  })
})
