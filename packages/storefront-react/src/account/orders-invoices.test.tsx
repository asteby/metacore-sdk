// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import type { InvoiceDoc } from '@asteby/storefront'
import { InvoiceList, RefundList, PaymentSummary } from './index.js'
import { InvoiceStatusCard } from '../fiscal/invoice-status-card.js'
import { demo } from './orders-fixtures.js'

afterEach(cleanup)
const AXE = { rules: { 'color-contrast': { enabled: false } } }
const doc = (d: Partial<InvoiceDoc> = {}): InvoiceDoc => ({ id: 'i1', status: 'issued', kind: 'invoice', series: 'A', folio_number: '10', folio: 'UUID-1', issued_at: '2026-08-13T10:00:00Z', ...d })
const fileHref = (d: InvoiceDoc, kind: string) => `/cuenta/facturas/${d.id}.${kind}`

describe('<InvoiceList />', () => {
  it('lists an issued invoice with PDF and XML through the store route only', () => {
    const { container } = render(<InvoiceList invoices={[doc()]} fileHref={fileHref} timeZone="UTC" />)
    const links = [...container.querySelectorAll<HTMLAnchorElement>('[data-sf-invoice-download]')]
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/cuenta/facturas/i1.pdf', '/cuenta/facturas/i1.xml'])
    expect(links[0]!.getAttribute('aria-label')).toBe('Descargar PDF, factura A-10')
    expect(container.querySelector('[data-sf-invoice-state]')!.textContent).toBe('Emitida')
    expect(container.textContent).toContain('Emitida el 13 de agosto de 2026')
  })

  it('never prints a link the store did not give it, even if the document carries url / xml_url', () => {
    const { container } = render(<InvoiceList invoices={[doc({ url: 'https://pac.example.com/a.pdf', xml_url: 'https://pac.example.com/a.xml', ...({ pdf_url: 'https://pac.example.com/p' } as object) })]} />)
    expect(container.innerHTML).not.toContain('pac.example.com')
    expect(container.querySelector('a')).toBeNull()
  })

  it('uses a handler when there is no route', () => {
    const onDownload = vi.fn()
    render(<InvoiceList invoices={[doc()]} onDownload={onDownload} />)
    fireEvent.click(screen.getByRole('button', { name: /Descargar XML/ }))
    expect(onDownload).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1' }), 'xml')
  })

  it('puts credit notes under their invoice and keeps orphans', () => {
    const { container } = render(
      <InvoiceList invoices={[doc(), doc({ id: 'n1', kind: 'credit_note', related_to: 'i1', series: 'NC', folio_number: '7', total: { amount: '200.00', currency_code: 'MXN' } }), doc({ id: 'n2', kind: 'credit_note', related_to: 'ghost' })]} fileHref={fileHref} />,
    )
    const groups = [...container.querySelectorAll('[data-sf-invoice-group]')]
    expect(groups).toHaveLength(2)
    expect(groups[0]!.querySelectorAll('[data-sf-invoice-kind=credit_note]')).toHaveLength(1)
    expect(groups[0]!.textContent).toContain('Corrige la factura A-10')
    expect(groups[0]!.textContent).toContain('$200.00')
    expect(groups[1]!.querySelector('[data-sf-invoice-kind=credit_note]')).toBeTruthy()
  })

  it('marks a sandbox invoice "test, not valid" with no download, or hides it', () => {
    const test = doc({ id: 't', test_mode: true, environment: 'sandbox' })
    const marked = render(<InvoiceList invoices={[test]} fileHref={fileHref} />).container
    expect(marked.textContent).toContain('Factura de prueba, sin validez')
    expect(marked.querySelector('a')).toBeNull()
    expect(marked.textContent).not.toContain('UUID-1')
    cleanup()
    const hidden = render(<InvoiceList invoices={[test]} testMode="hide" fileHref={fileHref} />).container
    expect(hidden.querySelector('[data-sf-invoice-doc]')).toBeNull()
    expect(hidden.querySelector('[data-sf-invoice-empty]')).toBeTruthy()
  })

  it('explains each non-issued state and gives it no download', () => {
    for (const [status, text] of [['pending', 'La estamos generando'], ['error', 'Contacta a la tienda'], ['cancelled', 'ya no tiene validez']] as const) {
      const { container } = render(<InvoiceList invoices={[doc({ status })]} fileHref={fileHref} />)
      expect(container.querySelector('[data-sf-invoice-note]')!.textContent).toContain(text)
      expect(container.querySelector('a')).toBeNull()
      cleanup()
    }
  })

  it('shows an unknown status as plain words', () => {
    const { container } = render(<InvoiceList invoices={[doc({ status: 'quantum' })]} fileHref={fileHref} />)
    expect(container.textContent).not.toContain('quantum')
    expect(container.querySelector('[data-sf-invoice-state]')!.textContent).toBe('En proceso')
  })

  it('shows a recoverable error for a section the server could not read', () => {
    const onRetry = vi.fn()
    const { container } = render(<InvoiceList degraded onRetry={onRetry} invoices={[doc()]} />)
    expect(container.querySelector('[role=alert]')!.textContent).toContain('No pudimos cargar esta sección')
    expect(container.querySelector('[data-sf-invoice-doc]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('hands the order invoice summary to the status card slot when there are no documents', () => {
    const { container } = render(<InvoiceList invoices={[]} summary={{ status: 'not_requested', stage: 'not_requested', can_request: true }} renderSummary={(s) => <InvoiceStatusCard invoice={s} requestHref="/factura" />} />)
    expect(container.querySelector('[data-sf-invoice-card]')).toBeTruthy()
    expect(container.querySelector('[data-sf-invoice-request]')!.getAttribute('href')).toBe('/factura')
    cleanup()
    expect(render(<InvoiceList />).container.querySelector('[data-sf-invoice-empty]')).toBeTruthy()
  })

  it('has no accessibility violations with the demo order (invoice + credit note, test, degraded)', async () => {
    const { detail } = await demo()
    const full = await detail('ord_seed_shipped')
    const test = await detail('ord_seed_sandbox')
    // One list per page in a real screen; each view is checked on its own (two regions with one name are a landmark clash).
    const views = [
      <InvoiceList key="a" invoices={full.invoices} fileHref={fileHref} />,
      <InvoiceList key="b" invoices={test.invoices} fileHref={fileHref} locale="en" />,
      <InvoiceList key="c" degraded onRetry={() => {}} />,
      <InvoiceList key="d" summary={full.invoice} renderSummary={(s) => <InvoiceStatusCard invoice={s} />} />,
      <RefundList key="e" refunds={full.refunds} />,
      <RefundList key="f" degraded onRetry={() => {}} />,
      <PaymentSummary key="g" payments={full.payments} />,
    ]
    for (const ui of views) {
      const r = render(<main>{ui}</main>)
      expect((await axe.run(r.container, AXE)).violations).toEqual([])
      r.unmount()
    }
  })
})

describe('<RefundList /> and <PaymentSummary />', () => {
  const refund = { id: 'r1', amount: { amount: '200.00', currency_code: 'MXN' }, status: 'completed', method_label: 'Visa 4242', created_at: '2026-08-15T09:00:00Z', completed_at: '2026-08-15T10:00:00Z' }
  it('lists refunds with amount, status and date; nothing when there are none', () => {
    const { container } = render(<RefundList refunds={[refund, { ...refund, id: 'r2', status: 'mystery', completed_at: null }]} timeZone="UTC" />)
    const items = container.querySelectorAll('[data-sf-refund]')
    expect(items[0]!.textContent).toContain('$200.00')
    expect(items[0]!.textContent).toContain('Completado el 15 de agosto de 2026')
    expect(items[1]!.textContent).toContain('En proceso')
    expect(items[1]!.textContent).not.toContain('mystery')
    cleanup()
    expect(render(<RefundList refunds={[]} />).container.innerHTML).toBe('')
    cleanup()
    expect(render(<RefundList refunds={[]} showEmpty />).container.textContent).toContain('no tiene reembolsos')
  })

  it('summarises payments and ignores malformed ones', () => {
    const { container } = render(<PaymentSummary payments={[{ method_label: 'OXXO', status: 'paid', amount: { amount: '10.00', currency_code: 'MXN' } }, null as never, { status: 'paid' } as never]} />)
    expect(container.querySelectorAll('[data-sf-payment]')).toHaveLength(1)
    expect(container.textContent).toContain('OXXO')
    expect(container.textContent).toContain('Pagado')
  })
})
