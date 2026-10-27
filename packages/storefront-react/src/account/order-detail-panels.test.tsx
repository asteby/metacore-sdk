// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import type { InvoiceDoc, Shipment } from '@asteby/storefront'
import { InvoiceDetail, InvoiceList, ShipmentCard, ShippingServiceCard } from './index.js'
import { addressLines } from './orders-ui.js'

afterEach(cleanup)
const AXE = { rules: { 'color-contrast': { enabled: false } } }
const fileHref = (d: InvoiceDoc, kind: string) => `/cuenta/pedidos/o1/facturas/${d.id}/${kind}`
const inv = (d: Partial<InvoiceDoc> = {}): InvoiceDoc => ({
  id: 'i1', status: 'issued', kind: 'invoice', series: 'A', folio_number: '123', folio: '6C1E2B8A-0000-4000-8000-00000000A001', issued_at: '2026-10-27T10:00:00Z',
  total: { amount: '204.00', currency_code: 'MXN' }, payment_method: 'PUE', payment_form: '04', available_files: ['pdf', 'xml'],
  receiver: { rfc: 'XAXX010101000', name: 'PUBLICO EN GENERAL', tax_regime: '616', cfdi_use: 'S01', postal_code: '06600' }, ...d,
})

describe('<InvoiceDetail />', () => {
  it('shows the emission data, the receiver and both downloads', () => {
    const { container } = render(<InvoiceDetail invoice={inv()} fileHref={fileHref} timeZone="UTC" />)
    const field = (k: string) => container.querySelector(`[data-sf-invoice-field="${k}"] dd`)?.textContent
    expect(field('folio')).toBe('6C1E2B8A-0000-4000-8000-00000000A001')
    expect(field('series')).toBe('A-123')
    expect(field('issued_at')).toBe('27 de octubre de 2026')
    expect(field('status')).toBe('Emitida')
    expect(field('total')).toBe('$204.00')
    expect(field('currency')).toBe('MXN')
    expect(field('payment_method')).toBe('Pago en una sola exhibición (PUE)')
    expect(field('payment_form')).toBe('04 · Tarjeta de crédito')
    expect(field('rfc')).toBe('XAXX010101000')
    expect(field('name')).toBe('PUBLICO EN GENERAL')
    expect(field('tax_regime')).toBe('616')
    expect(field('cfdi_use')).toBe('S01')
    expect(field('postal_code')).toBe('06600')
    expect([...container.querySelectorAll('a[data-sf-invoice-download]')].map((a) => a.getAttribute('href'))).toEqual(['/cuenta/pedidos/o1/facturas/i1/pdf', '/cuenta/pedidos/o1/facturas/i1/xml'])
    expect(container.querySelector('[data-sf-invoice-test]')).toBeNull()
  })

  it('uses the region catalog names when given, and says "in process" for the file that is missing', () => {
    const { container } = render(<InvoiceDetail invoice={inv({ available_files: ['xml'] })} fileHref={fileHref} taxRegimeLabel={(c) => (c === '616' ? 'Sin obligaciones fiscales' : null)} cfdiUseLabel={() => 'Sin efectos fiscales'} />)
    expect(container.querySelector('[data-sf-invoice-field="tax_regime"] dd')!.textContent).toBe('616 · Sin obligaciones fiscales')
    expect(container.querySelector('[data-sf-invoice-field="cfdi_use"] dd')!.textContent).toBe('S01 · Sin efectos fiscales')
    expect(container.querySelectorAll('a[data-sf-invoice-download]')).toHaveLength(1)
    expect(container.querySelector('[data-sf-invoice-file-pending="pdf"]')!.textContent).toContain('PDF todavía está en proceso')
  })

  it('marks a sandbox invoice as not valid and still lets the buyer download its labelled files', () => {
    const { container } = render(<InvoiceDetail invoice={inv({ test_mode: true, environment: 'sandbox' })} fileHref={fileHref} />)
    expect(container.querySelector('[data-sf-invoice-test]')!.textContent).toContain('Factura de prueba, sin validez')
    expect(container.querySelectorAll('a[data-sf-invoice-download]')).toHaveLength(2)
  })

  it('prints nothing it was not given and never a PAC link', () => {
    const { container } = render(
      <InvoiceDetail invoice={inv({ receiver: null, payment_method: null, payment_form: null, series: null, folio_number: null, issued_at: null, total: null, available_files: ['pdf', 'xml'], url: 'https://pac.example/a.pdf', xml_url: 'https://pac.example/a.xml' })} fileHref={fileHref} />,
    )
    for (const k of ['series', 'issued_at', 'total', 'currency', 'payment_method', 'payment_form', 'rfc']) expect(container.querySelector(`[data-sf-invoice-field="${k}"]`)).toBeNull()
    expect(container.querySelector('[data-sf-invoice-receiver]')).toBeNull()
    expect(container.innerHTML).not.toContain('pac.example')
  })

  it('speaks English and prints an unknown payment code as sent', () => {
    const { container } = render(<InvoiceDetail locale="en-US" invoice={inv({ payment_form: '77', payment_method: 'PPD' })} fileHref={fileHref} timeZone="UTC" />)
    expect(container.querySelector('[data-sf-invoice-field="payment_method"] dd')!.textContent).toBe('Installments or deferred (PPD)')
    expect(container.querySelector('[data-sf-invoice-field="payment_form"] dd')!.textContent).toBe('77')
    expect(container.querySelector('[data-sf-invoice-field="issued_at"] dd')!.textContent).toBe('October 27, 2026')
    expect(container.textContent).toContain('Billed to')
    expect(container.textContent).toContain('Download PDF')
  })

  it('has no axe violations', async () => {
    const { container } = render(<InvoiceDetail invoice={inv({ test_mode: true })} fileHref={fileHref} />)
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })
})

describe('<InvoiceList detailHref />', () => {
  it('links each document to its detail page and gives a sandbox invoice downloads only when asked', () => {
    const test = inv({ id: 't', test_mode: true })
    const { container } = render(<InvoiceList invoices={[inv(), test]} fileHref={fileHref} detailHref={() => '/cuenta/pedidos/o1/factura'} />)
    const links = [...container.querySelectorAll<HTMLAnchorElement>('[data-sf-invoice-detail-link] a')]
    expect(links).toHaveLength(2)
    expect(links[0]!.getAttribute('href')).toBe('/cuenta/pedidos/o1/factura')
    expect(links[0]!.textContent).toBe('Ver factura')
    expect(container.querySelectorAll('a[data-sf-invoice-download]')).toHaveLength(2)
    cleanup()
    expect(render(<InvoiceList invoices={[test]} fileHref={fileHref} testDownloads />).container.querySelectorAll('a[data-sf-invoice-download]')).toHaveLength(2)
  })

  it('offers no detail link for an invoice that failed', () => {
    const { container } = render(<InvoiceList invoices={[inv({ status: 'error' })]} detailHref={() => '/x'} />)
    expect(container.querySelector('[data-sf-invoice-detail-link]')).toBeNull()
  })
})

const svc = { title: 'Envío Paquetexpress', carrier: 'paquetexpress', eta_days_min: 1, eta_days_max: 3 }
const address = { first_name: 'Ana', last_name: 'Prueba', address1: 'Calle 1 #2', neighborhood: 'Centro', city: 'Querétaro', province: 'Qro.', zip: '76000', country_code: 'MX', phone: '4421234567' }
const ship = (s: Partial<Shipment> = {}): Shipment => ({ id: 's1', kind: 'outbound', status: 'in_transit', carrier: 'Paquetexpress', tracking_number: 'PX123456', tracking_url: 'https://rastreo.example/PX123456', events: [], ...s })
const order = (o: object = {}) => ({ shipping_service: svc, shipping_address: address, ...o })
const steps = (cur: string) => ['paid', 'preparing', 'shipped', 'in_transit', 'delivered'].map((key) => ({ key, state: key === cur ? 'current' : 'pending' }))

describe('<ShippingServiceCard detail />', () => {
  it('stays the summary without `detail`', () => {
    const { container } = render(<ShippingServiceCard order={order()} />)
    expect(container.querySelector('[data-sf-shipping-service-toggle]')).toBeNull()
  })

  it('opens to the service, address and timeline, and says the guide comes later', () => {
    const { container } = render(<ShippingServiceCard detail order={order({ progress: { stage: 'preparing', steps: steps('preparing') } })} />)
    const toggle = screen.getByRole('button', { name: 'Ver detalle del envío' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector<HTMLElement>('[data-sf-shipping-service-detail]')!.hidden).toBe(true)
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.textContent).toBe('Ocultar detalle del envío')
    const addr = container.querySelector('[data-sf-shipping-address]')!.textContent!
    expect(addr).toContain('Ana Prueba')
    expect(addr).toContain('Calle 1 #2')
    expect(addr).toContain('76000 Querétaro, Qro.')
    expect(addr).not.toContain('4421234567')
    expect([...container.querySelectorAll('[data-sf-step]')].map((s) => s.getAttribute('data-sf-step'))).toEqual(['preparing', 'shipped', 'in_transit', 'delivered'])
    expect(container.querySelector('[data-sf-step="preparing"]')!.getAttribute('aria-current')).toBe('step')
    expect(container.querySelector('[data-sf-shipping-no-guide]')!.textContent).toBe('Te mostraremos aquí el número de guía cuando salga tu paquete.')
  })

  it('shows the tracking number and an https tracking link when a live shipment has them', () => {
    const { container } = render(<ShippingServiceCard detail defaultOpen order={order({ shipments: [ship()] })} />)
    expect(container.querySelector('[data-sf-shipping-guide] code')!.textContent).toBe('PX123456')
    const a = container.querySelector<HTMLAnchorElement>('[data-sf-shipping-track]')!
    expect(a.getAttribute('href')).toBe('https://rastreo.example/PX123456')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    expect(container.querySelector('[data-sf-shipping-no-guide]')).toBeNull()
  })

  it('never shows a sandbox guide or link as real', () => {
    const { container } = render(<ShippingServiceCard detail defaultOpen order={order({ shipments: [ship({ test_mode: true, environment: 'sandbox' })] })} />)
    expect(container.innerHTML).not.toContain('PX123456')
    expect(container.innerHTML).not.toContain('rastreo.example')
    expect(container.querySelector('[data-sf-shipping-no-guide]')!.textContent).toContain('de prueba')
  })

  it('speaks English and survives a missing address', () => {
    const { container } = render(<ShippingServiceCard detail defaultOpen locale="en-US" order={{ shipping_service: svc }} />)
    expect(screen.getByRole('button', { name: 'Hide shipping details' })).toBeTruthy()
    expect(container.querySelector('[data-sf-shipping-no-address]')!.textContent).toBe('The delivery address is not available.')
    expect(container.querySelector('[data-sf-shipping-no-guide]')!.textContent).toContain('tracking number')
  })

  it('has no axe violations open', async () => {
    const { container } = render(<ShippingServiceCard detail defaultOpen order={order({ shipments: [ship()], progress: { stage: 'in_transit', steps: steps('in_transit') } })} />)
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })
})

describe('<ShipmentCard collapsible />', () => {
  const events = [{ id: 'e1', status: 'in_transit', occurred_at: '2026-10-27T10:00:00Z', description: 'En ruta' }]
  it('keeps the guide visible and opens the events', () => {
    const { container } = render(<ShipmentCard shipment={ship({ events })} collapsible />)
    expect(container.querySelector('[data-sf-shipment-number] code')!.textContent).toBe('PX123456')
    const toggle = screen.getByRole('button', { name: 'Ver detalle del envío' })
    expect(container.querySelector<HTMLElement>('[data-sf-shipment-detail]')!.hidden).toBe(true)
    fireEvent.click(toggle)
    expect(container.querySelector<HTMLElement>('[data-sf-shipment-detail]')!.hidden).toBe(false)
  })

  it('is unchanged without `collapsible`', () => {
    const { container } = render(<ShipmentCard shipment={ship({ events })} />)
    expect(container.querySelector('[data-sf-shipment-detail-toggle]')).toBeNull()
    expect(container.querySelector<HTMLElement>('[data-sf-shipment-detail]')!.hidden).toBe(false)
  })
})

describe('addressLines', () => {
  it('ignores non-text values and returns [] for nothing', () => {
    expect(addressLines(null)).toEqual([])
    expect(addressLines([1])).toEqual([])
    expect(addressLines({ address1: { x: 1 }, city: 'CDMX', zip: 6600 })).toEqual(['6600 CDMX'])
  })
})

describe('<InvoiceHistory />', () => {
  it('lists every invoice with its order, downloads on each visit and links', async () => {
    const { InvoiceHistory } = await import('./index.js')
    const entries = [
      { order: { id: 'o1', number: 'SO-00008' }, invoice: inv() },
      { order: { id: 'o2', number: 'SO-00009' }, invoice: inv({ id: 'i2', test_mode: true, available_files: ['xml'] }) },
    ]
    const { container } = render(<InvoiceHistory entries={entries} timeZone="UTC" fileHref={(d, k, o) => `/cuenta/pedidos/${o.id}/facturas/${d.id}/${k}`} detailHref={(_d, o) => `/cuenta/pedidos/${o.id}/factura`} orderHref={(o) => `/cuenta/pedidos/${o.id}`} />)
    const items = container.querySelectorAll('[data-sf-invoice-history-item]')
    expect(items).toHaveLength(2)
    expect(items[0]!.textContent).toContain('SO-00008')
    expect(items[0]!.textContent).toContain('$204.00')
    expect([...items[0]!.querySelectorAll('a[data-sf-invoice-download]')].map((a) => a.getAttribute('href'))).toEqual(['/cuenta/pedidos/o1/facturas/i1/pdf', '/cuenta/pedidos/o1/facturas/i1/xml'])
    expect(items[1]!.querySelector('[data-sf-invoice-test]')).not.toBeNull()
    expect(items[1]!.querySelectorAll('a[data-sf-invoice-download]')).toHaveLength(1)
    expect(items[1]!.querySelector('[data-sf-invoice-file-pending="pdf"]')).not.toBeNull()
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })
  it('says there is none', async () => {
    const { InvoiceHistory } = await import('./index.js')
    const { container } = render(<InvoiceHistory entries={[]} />)
    expect(container.querySelector('[data-sf-invoice-history-empty]')!.textContent).toContain('Aún no tienes facturas')
  })
})
