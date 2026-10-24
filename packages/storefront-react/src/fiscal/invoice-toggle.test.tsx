// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import type { FiscalIdentity, InvoicingCapabilities } from '@asteby/storefront'
import { MOCK_REGION_MX } from '@asteby/storefront/mock'
import { IdentityDocumentError, readPdfText } from '@asteby/storefront/fiscal-document'
import { InvoiceToggle, personTypeByLength, type InvoiceToggleState } from './index.js'
import { CSF_MORAL_LINES, RFC_MORAL } from './__fixtures__/csf.js'

vi.mock('@asteby/storefront/fiscal-document', async (orig) => {
  const actual = await orig<typeof import('@asteby/storefront/fiscal-document')>()
  return { ...actual, readPdfText: vi.fn(), decodePdfQr: vi.fn().mockResolvedValue(null) }
})
const read = vi.mocked(readPdfText)
const AXE = { rules: { 'color-contrast': { enabled: false } } }
const personTypeOf = personTypeByLength({ individual: 13, company: 12 })
const CAPS: InvoicingCapabilities = { available: true, countries: ['MX'], checkout: 'optional', post_purchase: true, identity_documents: ['MX:csf'], online_verify: false }
const PROFILE: FiscalIdentity = { country_code: 'MX', tax_id: 'PEPJ800101AB3', legal_name: 'JUAN CARLOS PEREZ PEREZ', tax_regime: '612', postal_code: '06600', invoice_use: 'G03' }

beforeEach(() => {
  read.mockReset()
})
afterEach(cleanup)

function setup(extra: Partial<React.ComponentProps<typeof InvoiceToggle>> = {}) {
  const states: InvoiceToggleState[] = []
  const utils = render(<InvoiceToggle region={MOCK_REGION_MX} capabilities={CAPS} workerSrc="/w.mjs" personTypeOf={personTypeOf} onChange={(s) => states.push(s)} {...extra} />)
  const last = () => states[states.length - 1]!
  return { ...utils, states, last }
}

describe('<InvoiceToggle />', () => {
  it('starts collapsed with the checkbox and the normal pay label', async () => {
    const { container, last } = setup()
    const box = screen.getByRole('checkbox', { name: 'Necesito factura (CFDI)' }) as HTMLInputElement
    expect(box.checked).toBe(false)
    expect(container.querySelector('[data-sf-invoice-body]')).toBeNull()
    expect(last()).toMatchObject({ requested: false, invoice: null, payLabel: 'Pagar' })
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })

  it('renders nothing when the store does not invoice at checkout', () => {
    const off = setup({ capabilities: { ...CAPS, checkout: 'off' } })
    expect(off.container.innerHTML).toBe('')
    off.unmount()
    const none = setup({ capabilities: { ...CAPS, available: false } })
    expect(none.container.innerHTML).toBe('')
  })

  it('without a profile it opens on the document reader; the pay button becomes "Pagar y facturar"', async () => {
    const { container, last } = setup()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(container.querySelector('[data-sf-document-reader]')).toBeTruthy()
    expect(last()).toMatchObject({ requested: true, ready: false, invoice: null, payLabel: 'Pagar y facturar' })
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })

  it('upload -> review -> confirm delivers a ready invoice request with the evidence', async () => {
    read.mockResolvedValue({ text: CSF_MORAL_LINES.join('\n'), pages: 1, sha256: 'cd'.repeat(32) })
    const { container, last } = setup({ now: () => new Date('2024-03-20') })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [new File(['%PDF-'], 'c.pdf', { type: 'application/pdf' })] } })
    await screen.findByRole('heading', { name: 'Revisa tus datos' })
    fireEvent.change(container.querySelector('select[name="invoice.use"]')!, { target: { value: 'G03' } })
    fireEvent.click(screen.getByRole('button', { name: 'Usar estos datos' }))
    await waitFor(() => expect(last().ready).toBe(true))
    expect(last()).toMatchObject({
      source: 'document',
      payLabel: 'Pagar y facturar',
      invoice: { requested: true, tax_id: RFC_MORAL, tax_regime: '601', use: 'G03', postal_code: '44100', country_code: 'MX', document: { kind: 'MX:csf', source: 'pdf_client' } },
    })
  })

  it('a document that cannot be read leads to manual entry, which is ready once valid', async () => {
    read.mockRejectedValue(new IdentityDocumentError('no_text', 'x'))
    const { container, last } = setup()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [new File(['%PDF-'], 'c.pdf', { type: 'application/pdf' })] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Captura tus datos a mano' }))
    const set = (n: string, v: string) => fireEvent.change(container.querySelector(`[name="invoice.${n}"]`)!, { target: { value: v } })
    set('tax_id', 'pepj800101ab3')
    set('legal_name', 'JUAN CARLOS PEREZ PEREZ')
    set('postal_code', '06600')
    expect(last().ready).toBe(false)
    // A person-type regime the RFC does not allow is not even listed.
    const regimes = [...container.querySelectorAll<HTMLOptionElement>('select[name="invoice.tax_regime"] option')].map((o) => o.value)
    expect(regimes).toContain('612')
    expect(regimes).not.toContain('601')
    set('tax_regime', '612')
    set('use', 'G03')
    expect(last()).toMatchObject({ ready: true, source: 'manual', invoice: { tax_id: 'PEPJ800101AB3', tax_regime: '612' } })
    expect(last().invoice).not.toHaveProperty('document')
    // Choosing another regime drops a use it does not admit (G03 is not for sueldos y salarios).
    const admits605 = MOCK_REGION_MX.fiscal_id!.invoice_uses.find((u) => u.code === 'G03')!.allowed_regimes!.includes('605')
    set('tax_regime', '605')
    expect((container.querySelector('select[name="invoice.use"]') as HTMLSelectElement).value).toBe(admits605 ? 'G03' : '')
  })

  it('manual: changing to a regime that does not admit the use clears it, and the use list follows', () => {
    const { container, last } = setup({ capabilities: { ...CAPS, identity_documents: [] } })
    fireEvent.click(screen.getByRole('checkbox'))
    // No document offered: the plain fields.
    expect(container.querySelector('[data-sf-document-reader]')).toBeNull()
    const set = (n: string, v: string) => fireEvent.change(container.querySelector(`[name="invoice.${n}"]`)!, { target: { value: v } })
    set('tax_id', 'ABC010203AB1')
    set('tax_regime', '601')
    const uses601 = [...container.querySelectorAll<HTMLOptionElement>('select[name="invoice.use"] option')].map((o) => o.value).filter(Boolean)
    const notFor601 = MOCK_REGION_MX.fiscal_id!.invoice_uses.find((u) => u.allowed_regimes?.length && !u.allowed_regimes.includes('601'))
    if (notFor601) expect(uses601).not.toContain(notFor601.code)
    set('use', uses601[0]!)
    expect((container.querySelector('select[name="invoice.use"]') as HTMLSelectElement).value).toBe(uses601[0])
    expect(last().ready).toBe(false) // still no legal name or postal code
  })

  it('with a saved profile: a card with the tax id masked, ready to pay, and no editable fields', async () => {
    const { container, last } = setup({ profile: PROFILE })
    fireEvent.click(screen.getByRole('checkbox'))
    const card = container.querySelector('[data-sf-invoice-profile]')!
    expect(card.textContent).toContain('PE********AB3')
    expect(card.textContent).not.toContain('PEPJ800101AB3')
    expect(card.textContent).toContain('JUAN CARLOS PEREZ PEREZ')
    expect(card.textContent).toContain('612 ·')
    expect(last()).toMatchObject({ ready: true, source: 'profile', invoice: { tax_id: 'PEPJ800101AB3', use: 'G03' }, payLabel: 'Pagar y facturar' })
    // The form still carries the data (no-JS checkout).
    expect(container.querySelector<HTMLInputElement>('input[type=hidden][name="invoice.tax_id"]')!.value).toBe('PEPJ800101AB3')
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })

  it('Cambiar edits the saved data; Usar otros datos starts over; both can go back', () => {
    const { container, last } = setup({ profile: PROFILE })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }))
    expect(container.querySelector<HTMLInputElement>('input[name="invoice.legal_name"]')!.value).toBe('JUAN CARLOS PEREZ PEREZ')
    fireEvent.change(container.querySelector('input[name="invoice.legal_name"]')!, { target: { value: 'JUAN C PEREZ' } })
    expect(last().invoice?.legal_name).toBe('JUAN C PEREZ')
    fireEvent.click(screen.getByRole('button', { name: 'Usar mis datos guardados' }))
    expect(last()).toMatchObject({ source: 'profile', invoice: { legal_name: 'JUAN CARLOS PEREZ PEREZ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Usar otros datos' }))
    expect(container.querySelector('[data-sf-document-reader]')).toBeTruthy()
    expect(last().ready).toBe(false)
  })

  it('a profile without invoice use opens for editing instead of pretending to be ready', () => {
    const { container } = setup({ profile: { ...PROFILE, invoice_use: null } })
    fireEvent.click(screen.getByRole('checkbox'))
    expect(container.querySelector('[data-sf-invoice-profile]')).toBeNull()
    expect(container.querySelector('select[name="invoice.use"]')).toBeTruthy()
  })

  it('unchecking returns to the normal pay label and drops the data', () => {
    const { last } = setup({ profile: PROFILE, defaultRequested: true })
    expect(last().requested).toBe(true)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(last()).toMatchObject({ requested: false, invoice: null, payLabel: 'Pagar' })
  })

  it('shows the errors the server returned, by field', () => {
    const { container } = setup({
      capabilities: { ...CAPS, identity_documents: [] },
      defaultRequested: true,
      data: { ok: false, error: { code: 'validation', field: 'invoice.use' }, fieldErrors: { 'invoice.use': 'El régimen 626 no admite el uso G03' } },
    })
    expect(container.querySelector('[data-sf-field-error]')!.textContent).toBe('El régimen 626 no admite el uso G03')
    expect(container.querySelector('select[name="invoice.use"]')!.getAttribute('aria-invalid')).toBe('true')
  })
})
