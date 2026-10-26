// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import type { InvoiceSummary } from '@asteby/storefront'
import { InvoiceStatusCard, invoiceCardState, type InvoiceCardState } from './index.js'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
const AXE = { rules: { 'color-contrast': { enabled: false } } }

const CASES: Array<[InvoiceCardState, InvoiceSummary | null, boolean | undefined, string]> = [
  ['not_requested', { status: 'none', stage: 'not_requested', can_request: true, action: 'request' }, undefined, '¿Necesitas factura de este pedido?'],
  ['awaiting_payment', { status: 'requested', stage: 'awaiting_payment' }, undefined, 'Esperando tu pago'],
  ['processing', { status: 'requested', stage: 'issuing', action: 'wait' }, undefined, 'Estamos generando tu factura'],
  ['issued', { status: 'issued', stage: 'issued', folio: '6A1B2C3D-0000-4000-8000-000000000001', url: 'https://f.test/a.pdf', xml_url: 'https://f.test/a.xml', action: 'download' }, undefined, 'Tu factura está lista'],
  ['needs_data', { status: 'requested', stage: 'needs_data', reason_code: 'invoice.tax_regime', action: 'correct_data' }, undefined, 'Faltan datos para tu factura'],
  ['needs_review', { status: 'requested', stage: 'needs_review', action: 'contact_store' }, undefined, 'La tienda está revisando tu factura'],
  ['window_closed', { status: 'none', stage: 'window_closed', can_request: false, blocked_reason: 'window_closed' }, undefined, 'Ya pasó el plazo para facturar'],
  ['unknown', null, false, 'Por ahora no podemos mostrar el estado de la facturación'],
  ['unavailable', { status: 'none', can_request: false, blocked_reason: 'not_invoiceable' }, undefined, 'Este pedido no se puede facturar por ahora'],
]

describe('invoiceCardState', () => {
  it.each(CASES)('%s', (state, invoice, available) => {
    expect(invoiceCardState(invoice, available)).toBe(state)
  })
  it('a blocked order the store cannot invoice is unavailable; unknown stages do not invent a state', () => {
    expect(invoiceCardState({ status: 'none', can_request: false, blocked_reason: 'not_invoiceable' })).toBe('unavailable')
    expect(invoiceCardState({ status: 'cancelled', stage: 'cancelled' })).toBe('cancelled')
    expect(invoiceCardState({ status: 'x', stage: 'something_new' })).toBe('not_requested')
  })
})

describe('availability: never claims the store does not invoice unless the server says so', () => {
  const askable: InvoiceSummary = { status: 'none', stage: 'not_requested', action: 'request', can_request: true }
  it('the server says it is off -> not_enabled, over the order', () => {
    expect(invoiceCardState(askable, false, 'off')).toBe('not_enabled')
    expect(invoiceCardState(null, false, 'no_region')).toBe('not_enabled')
  })
  it('no capability published / unreachable: the order decides, else neutral', () => {
    expect(invoiceCardState(askable, false, 'unknown')).toBe('not_requested')
    expect(invoiceCardState({ status: 'issued', stage: 'issued' }, false, 'unreachable')).toBe('issued')
    expect(invoiceCardState(null, false, 'unknown')).toBe('unknown')
    expect(invoiceCardState({ status: 'none', can_request: false }, false, 'unreachable')).toBe('unreachable')
  })
  it('renders the true reason, the window and the sandbox badge', () => {
    const a = render(<InvoiceStatusCard invoice={null} available={false} availability="off" contact={{ email: 'a@t.test' }} />)
    expect(a.container.textContent).toContain('todavía no tiene la facturación en línea activa')
    expect(a.container.textContent).not.toContain('no emite')
    a.unmount()
    const b = render(<InvoiceStatusCard invoice={askable} available={false} availability="unknown" requestHref="/f" windowDays={30} testMode />)
    expect(b.container.querySelector('[data-sf-invoice-request]')!.getAttribute('href')).toBe('/f')
    expect(b.container.querySelector('[data-sf-invoice-window]')!.textContent).toContain('30 días')
    expect(b.container.querySelector('[data-sf-invoice-sandbox]')!.textContent).toContain('sandbox')
    b.unmount()
    const c = render(<InvoiceStatusCard invoice={null} available={false} availability="unreachable" onRefresh={() => {}} locale="en" />)
    expect(c.container.textContent).toContain('could not check invoicing')
    expect(c.container.querySelector('[data-sf-invoice-refresh]')).not.toBeNull()
  })
})

describe('<InvoiceStatusCard /> the 8 states', () => {
  it.each(CASES)('%s renders its message, a state attribute and passes axe', async (state, invoice, available, text) => {
    const { container } = render(<InvoiceStatusCard invoice={invoice} {...(available === undefined ? {} : { available })} onRequest={() => {}} onCorrect={() => {}} contact={{ email: 'ayuda@tienda.test' }} />)
    const card = container.querySelector('[data-sf-invoice-card]')!
    expect(card.getAttribute('data-state')).toBe(state)
    expect(card.textContent).toContain(text)
    // The state is never only a color: a shape stands in front of the title.
    expect(card.querySelector('[data-sf-invoice-icon]')!.textContent).toBeTruthy()
    expect(card.querySelector('[data-sf-invoice-icon]')!.getAttribute('aria-hidden')).toBe('true')
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })

  it('not requested: the request button calls back; without can_request it is not offered', () => {
    const onRequest = vi.fn()
    const a = render(<InvoiceStatusCard invoice={{ status: 'none', can_request: true }} onRequest={onRequest} />)
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar factura' }))
    expect(onRequest).toHaveBeenCalledTimes(1)
    a.unmount()
    const b = render(<InvoiceStatusCard invoice={{ status: 'none', can_request: false }} onRequest={onRequest} />)
    expect(b.container.querySelector('[data-sf-invoice-request]')).toBeNull()
  })

  it('issued: folio, PDF and XML links', () => {
    const { container } = render(<InvoiceStatusCard invoice={CASES[3]![1]!} />)
    expect(container.querySelector('[data-sf-invoice-folio]')!.textContent).toContain('6A1B2C3D-0000-4000-8000-000000000001')
    expect(container.querySelector<HTMLAnchorElement>('[data-sf-invoice-pdf]')!.href).toBe('https://f.test/a.pdf')
    expect(container.querySelector<HTMLAnchorElement>('[data-sf-invoice-xml]')!.href).toBe('https://f.test/a.xml')
  })

  it('needs data: says the cause in words and offers "Corregir y reintentar"', () => {
    const onCorrect = vi.fn()
    const { container } = render(<InvoiceStatusCard invoice={CASES[4]![1]!} onCorrect={onCorrect} />)
    expect(container.querySelector('[data-sf-invoice-reason]')!.textContent).toBe('El régimen fiscal no es válido para tus datos.')
    fireEvent.click(screen.getByRole('button', { name: 'Corregir y reintentar' }))
    expect(onCorrect).toHaveBeenCalled()
    cleanup()
    const unknown = render(<InvoiceStatusCard invoice={{ status: 'x', stage: 'needs_data', reason_code: 'odd' }} correctHref="/cuenta/facturacion" />)
    expect(unknown.container.querySelector('[data-sf-invoice-reason]')!.textContent).toBe('Revisa tus datos fiscales y vuelve a intentarlo.')
    expect(unknown.container.querySelector<HTMLAnchorElement>('[data-sf-invoice-correct]')!.getAttribute('href')).toBe('/cuenta/facturacion')
  })

  it('needs review: gives the store contact', () => {
    const { container } = render(<InvoiceStatusCard invoice={CASES[5]![1]!} contact={{ email: 'ayuda@tienda.test' }} />)
    expect(container.textContent).toContain('ayuda@tienda.test')
    expect(container.querySelector<HTMLAnchorElement>('[data-sf-invoice-contact]')!.href).toBe('mailto:ayuda@tienda.test')
  })

  it('English with locale="en"', () => {
    const { container } = render(<InvoiceStatusCard invoice={CASES[3]![1]!} locale="en" />)
    expect(container.textContent).toContain('Your invoice is ready')
  })
})

describe('<InvoiceStatusCard /> processing refresh', () => {
  it('refreshes every 10 s for at most a minute, then stops and says it is still going', () => {
    vi.useFakeTimers()
    const onRefresh = vi.fn()
    const { container } = render(<InvoiceStatusCard invoice={CASES[2]![1]!} onRefresh={onRefresh} />)
    expect(container.textContent).toContain('Suele tardar menos de un minuto')
    act(() => void vi.advanceTimersByTime(10_000))
    expect(onRefresh).toHaveBeenCalledTimes(1)
    act(() => void vi.advanceTimersByTime(50_000))
    expect(onRefresh.mock.calls.length).toBeGreaterThanOrEqual(5)
    const calls = onRefresh.mock.calls.length
    act(() => void vi.advanceTimersByTime(60_000))
    expect(onRefresh.mock.calls.length).toBe(calls)
    expect(container.textContent).toContain('Sigue en proceso')
    // Manual refresh is still there.
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    expect(onRefresh.mock.calls.length).toBe(calls + 1)
  })

  it('stops refreshing when the invoice is issued', () => {
    vi.useFakeTimers()
    const onRefresh = vi.fn()
    const { rerender } = render(<InvoiceStatusCard invoice={CASES[2]![1]!} onRefresh={onRefresh} />)
    rerender(<InvoiceStatusCard invoice={CASES[3]![1]!} onRefresh={onRefresh} />)
    act(() => void vi.advanceTimersByTime(30_000))
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('does not refresh states that are not processing', () => {
    vi.useFakeTimers()
    const onRefresh = vi.fn()
    render(<InvoiceStatusCard invoice={CASES[1]![1]!} onRefresh={onRefresh} />)
    act(() => void vi.advanceTimersByTime(30_000))
    expect(onRefresh).not.toHaveBeenCalled()
  })
})
