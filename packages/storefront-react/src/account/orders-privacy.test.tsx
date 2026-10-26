// @vitest-environment happy-dom
// What must never reach the page: script-able links, carrier HTML, PAC URLs, and anything of a sandbox shipment or
// invoice that could pass as real (number, link, label, events), not even in attributes or hidden text.
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { InvoiceDoc, Order, Shipment } from '@asteby/storefront'
import { InvoiceList, NextActionBar, OrderCard, ShipmentCard } from './index.js'

const ship = (s: Partial<Shipment> = {}): Shipment => ({ id: 's1', kind: 'outbound', status: 'in_transit', carrier: 'Estafeta', tracking_number: 'GUIA-998877', tracking_url: 'https://rastreo.example.com/GUIA-998877', events: [], ...s })

describe('links and carrier text', () => {
  it('only an https link without credentials becomes the tracking link', () => {
    for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'http://rastreo.example.com', 'https://u:p@rastreo.example.com', 'data:text/html,<b>x', '//rastreo.example.com', ' javascript:alert(1)', 'vbscript:x']) {
      const html = renderToString(<ShipmentCard shipment={ship({ tracking_url: bad })} />)
      expect(html, bad).not.toContain('data-sf-shipment-track')
    }
    expect(renderToString(<ShipmentCard shipment={ship()} />)).toContain('href="https://rastreo.example.com/GUIA-998877"')
  })

  it('carrier event text with HTML is shown as text; an outbound label link is never shown', () => {
    const html = renderToString(
      <ShipmentCard
        shipment={ship({ label_url: 'https://labels.example.com/outbound.pdf', events: [{ id: 'e1', status: 'in_transit', description: '<img src=x onerror=alert(1)><a href="javascript:x">ver</a>', location: '<b>CDMX</b>', occurred_at: '2026-10-01T10:00:00Z' }] })}
      />,
    )
    expect(html).not.toMatch(/<img|<a href="javascript|<b>/)
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('labels.example.com')
  })

  it('a server next_action with a script link renders no link', () => {
    const html = renderToString(<NextActionBar action={{ kind: 'track', href: 'javascript:alert(1)' }} />)
    expect(html).not.toContain('javascript:')
  })
})

describe('sandbox (test_mode) never passes as real', () => {
  const sandbox = ship({
    test_mode: true,
    label_url: 'https://labels.example.com/x.pdf',
    service: 'Express sandbox',
    events: [{ id: 'e1', status: 'delivered', description: 'Recibió JUAN PEREZ', location: 'Querétaro', occurred_at: '2026-10-01T10:00:00Z' }],
    map: { destination: { label: 'Querétaro', lat: 20.6, lng: -100.4, precision: 'city' } },
  })
  it.each([
    ['test_mode', sandbox],
    ['environment sandbox', { ...sandbox, test_mode: false, environment: 'sandbox' }],
    ['return label', { ...sandbox, kind: 'return' }],
  ] as const)('%s: no number, link, label, events or map, anywhere in the HTML', (_n, s) => {
    for (const testMode of ['mark', 'hide'] as const) {
      const html = renderToString(<ShipmentCard shipment={s as Shipment} testMode={testMode} renderMap={() => <div data-map />} renderCarrierMark={() => <i data-mark />} />)
      for (const leak of ['GUIA-998877', 'rastreo.example.com', 'labels.example.com', 'JUAN', 'Express sandbox', 'data-map', 'data-mark']) expect(html, `${testMode}: ${leak}`).not.toContain(leak)
    }
  })

  it('an order with only sandbox shipments offers no tracking and shows no shipment summary', () => {
    const order = { id: 'o1', number: '1001', status: 'shipped', created_at: '2026-10-01T00:00:00Z', total: { amount: '10.00', currency_code: 'MXN' }, lines: [], shipments: [sandbox], shipments_summary: { count: 1, status: 'in_transit', carrier: 'Estafeta' } } as unknown as Order
    const html = renderToString(<><NextActionBar order={order} onAction={() => {}} /><OrderCard order={order} orderHref={() => '/o'} /></>)
    expect(html).not.toMatch(/rastreo\.example|GUIA-998877|data-sf-action="track"|data-sf-order-shipment/)
  })

  it('a sandbox invoice has no download and no folio; PAC links on the document never reach the page', () => {
    const docs = [
      { id: 'inv_t', kind: 'invoice', status: 'issued', test_mode: true, folio: 'UUID-TEST-1', url: 'https://pac.example/doc.pdf', pdf_url: 'https://pac.example/p.pdf' },
      { id: 'inv_r', kind: 'invoice', status: 'issued', folio: 'UUID-REAL-2', url: 'https://pac.example/real.pdf', xml_url: 'https://pac.example/real.xml' },
    ] as unknown as InvoiceDoc[]
    const html = renderToString(<InvoiceList invoices={docs} fileHref={(d, k) => `/cuenta/f/${d.id}.${k}`} />)
    expect(html).not.toContain('pac.example')
    expect(html).not.toContain('UUID-TEST-1')
    expect(html).not.toContain('/cuenta/f/inv_t')
    expect(html).toContain('/cuenta/f/inv_r.pdf')
    expect(renderToString(<InvoiceList invoices={docs} />)).not.toMatch(/href=/)
  })
})
