// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { InvoiceSummary } from '@asteby/storefront'
import { InvoiceRejectionNotice, InvoiceStatusCard, invoiceCorrection } from './index.js'

afterEach(cleanup)

const REFUSED: InvoiceSummary = {
  status: 'error',
  stage: 'needs_data',
  action: 'correct_data',
  can_request: true,
  reason_code: 'invoice.legal_name',
  reason_field: 'legal_name',
  reason_message: 'No pudimos emitir tu factura: el nombre o razón social no coincide con el SAT. Revisa tus datos y vuelve a intentarlo.',
  submitted: { tax_id: 'URE180429TM6', legal_name: 'UNIVERSIDAD ROBOTICA', tax_regime: '601', postal_code: '86991', invoice_use: 'G03' },
  retries_left: 4,
}

describe('invoiceCorrection', () => {
  it('prefills the form with what was sent and marks the refused field', () => {
    const c = invoiceCorrection(REFUSED, { fieldRefused: 'Revisa este dato' })
    expect(c.canCorrect).toBe(true)
    expect(c.values).toEqual({ tax_id: 'URE180429TM6', legal_name: 'UNIVERSIDAD ROBOTICA', postal_code: '86991', tax_regime: '601', use: 'G03' })
    expect(c.controlName).toBe('invoice.legal_name')
    expect(c.errors).toEqual({ 'invoice.legal_name': 'Revisa este dato' })
    expect(c.retriesLeft).toBe(4)
    expect(c.message).toContain('el nombre o razón social no coincide con el SAT')
  })
  it('maps invoice_use to the form control `use`', () => {
    const c = invoiceCorrection({ ...REFUSED, reason_field: 'invoice_use' })
    expect(c.field).toBe('use')
    expect(Object.keys(c.errors)).toEqual(['invoice.use'])
  })
  it('an older server (no details) still lets the buyer retry, with nothing prefilled or marked', () => {
    const c = invoiceCorrection({ status: 'error', stage: 'needs_data', action: 'correct_data', can_request: true })
    expect(c).toMatchObject({ canCorrect: true, values: {}, errors: {}, message: null, retriesLeft: null })
  })
  it('no attempts left, or not needing data: no correction form', () => {
    expect(invoiceCorrection({ ...REFUSED, retries_left: 0 }).canCorrect).toBe(false)
    expect(invoiceCorrection({ status: 'issued', stage: 'issued' }).canCorrect).toBe(false)
    expect(invoiceCorrection(null).canCorrect).toBe(false)
  })
})

describe('InvoiceRejectionNotice', () => {
  it('says what to fix in plain words and how many attempts are left', () => {
    render(<InvoiceRejectionNotice invoice={REFUSED} />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('No pudimos emitir tu factura')
    expect(alert.textContent).toContain('el nombre o razón social no coincide con el SAT')
    expect(alert.textContent).toContain('Te quedan 4 intentos hoy.')
    expect(alert.getAttribute('data-field')).toBe('legal_name')
  })
  it('singular, English, and nothing for a first request', () => {
    const { container, rerender } = render(<InvoiceRejectionNotice invoice={{ ...REFUSED, retries_left: 1 }} />)
    expect(container.textContent).toContain('Te queda 1 intento hoy.')
    rerender(<InvoiceRejectionNotice invoice={{ ...REFUSED, reason_message: null, reason_code: 'invoice.tax_id' }} locale="en" />)
    expect(container.textContent).toContain('We could not issue your invoice')
    expect(container.textContent).toContain('The tax ID is not valid.')
    rerender(<InvoiceRejectionNotice invoice={{ status: 'none', stage: 'not_requested' }} />)
    expect(container.textContent).toBe('')
  })
})

describe('InvoiceStatusCard with the server reason', () => {
  it('needs_data shows the server message instead of the generic table', () => {
    render(<InvoiceStatusCard invoice={REFUSED} correctHref="#fix" />)
    expect(screen.getByText(/el nombre o razón social no coincide con el SAT/)).toBeTruthy()
  })
  it('needs_review for a refusal that is not the buyer fault shows the server message', () => {
    render(
      <InvoiceStatusCard
        invoice={{ status: 'error', stage: 'needs_review', action: 'contact_store', can_request: false, reason_message: 'No pudimos emitir tu factura por un problema de nuestro lado, no por tus datos.' }}
      />,
    )
    expect(screen.getByText(/problema de nuestro lado/)).toBeTruthy()
  })
})
