// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import axe from 'axe-core'
import type { Order, Shipment } from '@asteby/storefront'
import { InvoiceHistory, InvoiceSummaryCard, OrderCard, OrderPageHeader, OrderSandboxNotice, OrderTotals, PaymentDetail, PaymentSummaryCard, ShipmentDetail, ShipmentSummaryCard } from './index.js'
import { accountMessages } from './orders-messages.js'

afterEach(cleanup)
const AXE = { rules: { 'color-contrast': { enabled: false } } }
const money = (a: string) => ({ amount: a, currency_code: 'MXN' })
const ship = (s: Partial<Shipment> = {}): Shipment => ({
  id: 's1',
  kind: 'outbound',
  status: 'in_transit',
  carrier: 'Paquetexpress',
  tracking_number: '8012345678',
  tracking_url: 'https://rastreo.example.com/8012345678',
  promised_by: '2026-10-30',
  events: [{ id: 'e1', status: 'in_transit', occurred_at: '2026-10-28T10:00:00Z', description: 'En ruta', location: 'Querétaro' }],
  ...s,
})
const order = {
  id: 'o1',
  number: 'SO-00008',
  status: 'shipped',
  created_at: '2026-10-27T15:00:00Z',
  delivery_method: 'shipping',
  total: money('204.00'),
  subtotal: money('150.00'),
  shipping: money('54.00'),
  shipping_service: { title: 'Envío Paquetexpress', carrier: 'paquetexpress', eta_days_min: 1, eta_days_max: 3 },
  shipping_address: { first_name: 'Danny', address1: 'Calle 1', city: 'Querétaro', zip: '76000' },
  shipments: [ship()],
  payments: [{ method_label: 'Card', family: 'card', status: 'paid', amount: money('204.00'), paid_at: '2026-10-27T15:01:00Z', brand: 'visa', last4: '4242' }],
  lines: [],
} as unknown as Order

describe('summary cards', () => {
  it('shipping: two key lines and ONE link, no address or timeline', () => {
    const { container } = render(<ShipmentSummaryCard order={order} href="/p/envio" />)
    expect(container.querySelectorAll('a')).toHaveLength(1)
    expect(container.querySelector('a')!.textContent).toBe('Ver detalle')
    expect(container.textContent).toContain('Envío Paquetexpress')
    expect(container.textContent).toContain('Llega a más tardar el 30 de octubre de 2026')
    expect(container.textContent).not.toContain('Calle 1')
    expect(container.querySelector('[data-sf-progress]')).toBeNull()
  })
  it('shipping: nothing for pickup', () => {
    const { container } = render(<ShipmentSummaryCard order={{ ...order, delivery_method: 'pickup' } as Order} href="/x" />)
    expect(container.innerHTML).toBe('')
  })
  it('invoice: issued shows «Ver factura» and no downloads; none offers to request', () => {
    const doc = { id: 'i1', status: 'issued', kind: 'invoice', series: 'A', folio_number: '10', total: money('204.00'), issued_at: '2026-10-27T16:00:00Z' }
    const a = render(<InvoiceSummaryCard invoices={[doc]} href="/p/factura" />)
    expect(a.container.querySelector('a')!.textContent).toBe('Ver factura')
    expect(a.container.querySelector('[data-sf-invoice-download]')).toBeNull()
    expect(a.container.textContent).toContain('Factura A-10')
    a.unmount()
    const b = render(<InvoiceSummaryCard summary={{ status: 'none', stage: 'not_requested', can_request: true }} href="/p/factura" />)
    expect(b.container.querySelector('a')!.textContent).toBe('Solicitar factura')
    b.unmount()
    const c = render(<InvoiceSummaryCard summary={{ status: 'none', stage: 'not_requested', can_request: false, blocked_reason: 'awaiting_payment' }} href="/p/factura" />)
    expect(c.container.querySelector('a')).toBeNull()
  })
  it('payment: method, amount, state, date; card digits stay on the payment page', () => {
    const { container } = render(<PaymentSummaryCard payments={order.payments} href="/p/pago" />)
    expect(container.textContent).toContain('Pagado')
    expect(container.textContent).not.toContain('terminación')
    expect(container.querySelectorAll('a')).toHaveLength(1)
  })
  it('the three cards pass axe and have the same structure', async () => {
    const { container } = render(
      <main>
        <h1>Pedido</h1>
        <ShipmentSummaryCard order={order} href="/e" />
        <InvoiceSummaryCard summary={{ status: 'none', stage: 'not_requested', can_request: true }} href="/f" />
        <PaymentSummaryCard payments={order.payments} href="/p" />
      </main>,
    )
    expect(container.querySelectorAll('[data-sf-summary-card]')).toHaveLength(3)
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })
})

describe('header, sandbox band, totals', () => {
  it('breadcrumb, title, meta and the status once', async () => {
    const { container } = render(<main><OrderPageHeader order={order} title="Envío" backHref="/cuenta/pedidos/o1" /></main>)
    expect(container.querySelector('nav a')!.textContent).toBe('← Pedido SO-00008')
    expect(container.querySelector('h1')!.textContent).toBe('Envío')
    expect(container.querySelectorAll('[data-sf-order-badge]')).toHaveLength(1)
    expect(container.textContent).toContain('Pedido SO-00008 · Realizado el 27 de octubre de 2026')
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })
  it('sandbox band and totals', () => {
    const a = render(<OrderSandboxNotice />)
    expect(a.container.textContent).toContain('Modo de prueba.')
    a.unmount()
    const { container } = render(<OrderTotals order={order} />)
    expect(container.querySelectorAll('[data-sf-total]')).toHaveLength(3)
  })
})

describe('<ShipmentDetail />', () => {
  it('prints delivery, one timeline, the guide with copy, the https link and the events', async () => {
    const { container } = render(<main><h1>Envío</h1><ShipmentDetail order={order} help={<a href="mailto:a@b.mx">Contactar</a>} renderMap={() => <div data-testid="map" />} /></main>)
    const t = container.textContent!
    expect(t).toContain('Dirección de entrega')
    expect(t).toContain('Calle 1')
    expect(container.querySelectorAll('[data-sf-progress]')).toHaveLength(1)
    expect(container.querySelector('[data-sf-shipping-guide] code')!.textContent).toBe('8012345678')
    expect(container.querySelector('[data-sf-shipping-track]')!.getAttribute('href')).toBe('https://rastreo.example.com/8012345678')
    expect(container.querySelectorAll('[data-sf-shipment-events] li')).toHaveLength(1)
    expect(t).toContain('¿Necesitas ayuda con tu envío?')
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })
  it('sandbox shipment: no guide, no link, no sandbox text (the band says it once)', () => {
    const { container } = render(<ShipmentDetail order={{ ...order, shipments: [ship({ test_mode: true })] } as Order} />)
    expect(container.querySelector('code')).toBeNull()
    expect(container.querySelector('a')).toBeNull()
    expect(container.textContent).not.toMatch(/sandbox/i)
    expect(container.querySelector('[data-sf-shipping-no-guide]')).not.toBeNull()
  })
  it('no shipments yet says what comes next; error is recoverable', () => {
    const a = render(<ShipmentDetail order={{ ...order, shipments: [], status: 'paid' } as unknown as Order} />)
    expect(a.container.textContent).toContain('En cuanto salga te mostramos aquí')
    a.unmount()
    const b = render(<ShipmentDetail order={{ ...order, shipments: [] } as unknown as Order} degraded onRetry={() => {}} />)
    expect(b.container.querySelector('[role="alert"]')).not.toBeNull()
    expect(b.container.querySelector('[data-sf-retry]')).not.toBeNull()
  })
  it('English', () => {
    const { container } = render(<ShipmentDetail order={order} locale="en-US" messages={accountMessages('en-US')} />)
    expect(container.textContent).toContain('Delivery address')
  })
})

describe('<PaymentDetail />', () => {
  it('method, amount, state, date, masked reference, refunds and totals', async () => {
    const { container } = render(
      <main>
        <h1>Pago</h1>
        <PaymentDetail order={{ ...order, refunds: [{ id: 'r1', amount: money('10.00'), status: 'completed', created_at: '2026-10-28T10:00:00Z' }] } as Order} />
      </main>,
    )
    const t = container.textContent!
    expect(t).toContain('Visa')
    expect(t.match(/4242/g)).toHaveLength(1)
    expect(t).toContain('Tarjeta')
    expect(t).toContain('Reembolsos')
    expect(t).toContain('Totales del pedido')
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })
  it('empty and pending states', () => {
    const a = render(<PaymentDetail order={{ ...order, payments: [] } as Order} />)
    expect(a.container.textContent).toContain('aún no tiene pagos')
    a.unmount()
    const b = render(<PaymentDetail order={{ ...order, payments: [{ method_label: 'oxxo', status: 'pending', amount: money('204.00') }] } as Order} renderPending={() => <a href="/ficha">Ver ficha de pago</a>} />)
    expect(b.container.textContent).toContain('sigue pendiente')
    expect(b.container.querySelector('a')!.textContent).toBe('Ver ficha de pago')
  })
})

describe('list rows', () => {
  it('OrderCard row: one link, no progress, no shipment line', () => {
    const { container } = render(<OrderCard order={order} orderHref={() => '/o'} variant="row" />)
    expect(container.querySelector('[data-sf-progress]')).toBeNull()
    expect(container.querySelector('[data-sf-order-shipment]')).toBeNull()
    expect(container.querySelector('[data-sf-order-detail-link]')!.textContent).toBe('Ver detalle')
    expect(container.querySelector('[data-sf-action]')).toBeNull()
  })
  it('InvoiceHistory compact: no downloads, one detail link', () => {
    const doc = { id: 'i1', status: 'issued', kind: 'invoice', folio: 'ABC', series: 'A', folio_number: '10', total: money('204.00'), issued_at: '2026-10-27T16:00:00Z' }
    const { container } = render(<InvoiceHistory compact entries={[{ order: { id: 'o1', number: 'SO-00008' }, invoice: doc }]} fileHref={() => '/f'} detailHref={() => '/d'} orderHref={() => '/o'} />)
    expect(container.querySelector('[data-sf-invoice-download]')).toBeNull()
    expect(container.querySelectorAll('a')).toHaveLength(1)
  })
})
