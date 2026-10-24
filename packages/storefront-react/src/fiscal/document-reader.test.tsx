// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { MOCK_REGION_MX } from '@asteby/storefront/mock'
import { IdentityDocumentError, decodePdfQr, readPdfText } from '@asteby/storefront/fiscal-document'
import { personTypeByLength } from './format.js'
import { IdentityDocumentReader, type FiscalReaderResult } from './index.js'
import { CSF_FISICA_LINES, CSF_MORAL_LINES, CURP_FISICA, ID_CIF_FISICA, QR_URL_FISICA, QR_URL_OTRO, RFC_FISICA, RFC_MORAL } from './__fixtures__/csf.js'

// pdf.js needs a real browser; the engine (extract + evidence) is the real one, only the PDF/QR reading is faked.
vi.mock('@asteby/storefront/fiscal-document', async (orig) => {
  const actual = await orig<typeof import('@asteby/storefront/fiscal-document')>()
  return { ...actual, readPdfText: vi.fn(), decodePdfQr: vi.fn() }
})

const read = vi.mocked(readPdfText)
const qr = vi.mocked(decodePdfQr)
const SHA = 'ab'.repeat(32)
const AXE = { rules: { 'color-contrast': { enabled: false } } }
const FRESH = () => new Date('2024-04-01T12:00:00Z')
const personTypeOf = personTypeByLength({ individual: 13, company: 12 })

const pdf = (name = 'constancia.pdf', type = 'application/pdf', size?: number) => {
  const f = new File(['%PDF-1.4'], name, { type })
  if (size) Object.defineProperty(f, 'size', { value: size })
  return f
}
const returns = (lines: string[]) => read.mockResolvedValue({ text: lines.join('\n'), pages: 1, sha256: SHA })

beforeEach(() => {
  read.mockReset()
  qr.mockReset()
  qr.mockResolvedValue(null)
})
afterEach(cleanup)

function setup(extra: Partial<React.ComponentProps<typeof IdentityDocumentReader>> = {}) {
  const onConfirm = vi.fn<(r: FiscalReaderResult) => void>()
  const utils = render(<IdentityDocumentReader region={MOCK_REGION_MX} workerSrc="/assets/pdf.worker.mjs" onConfirm={onConfirm} now={FRESH} personTypeOf={personTypeOf} {...extra} />)
  const input = () => utils.container.querySelector<HTMLInputElement>('input[type=file]')!
  const upload = (f: File) => fireEvent.change(input(), { target: { files: [f] } })
  return { ...utils, onConfirm, input, upload }
}

describe('<IdentityDocumentReader /> idle', () => {
  it('shows the zone, the privacy promise, where to get the document and the way out', async () => {
    const { container, input } = setup()
    expect(screen.getByRole('heading', { name: 'Sube tu constancia de situación fiscal' })).toBeTruthy()
    expect(container.textContent).toContain('La leemos en tu dispositivo. No guardamos el archivo, solo los datos que confirmes.')
    const obtain = container.querySelector<HTMLAnchorElement>('[data-sf-reader-obtain]')!
    expect(obtain.href).toBe(MOCK_REGION_MX.fiscal_id!.documents![0]!.obtain_url)
    expect(obtain.rel).toContain('noopener')
    expect(screen.getByRole('button', { name: 'Captura tus datos a mano' })).toBeTruthy()
    // The file type follows the spec; the real input is focusable (keyboard) and named by its zone.
    expect(input().accept).toBe(MOCK_REGION_MX.fiscal_id!.documents![0]!.accept.join(','))
    expect(input().tabIndex).toBeGreaterThanOrEqual(0)
    expect(input().labels?.[0]?.hasAttribute('data-sf-reader-zone')).toBe(true)
    expect(input().getAttribute('aria-describedby')).toBeTruthy()
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })

  it('never names the file input, so the PDF never travels with the surrounding form', async () => {
    const { input } = setup()
    await waitFor(() => expect(input().hasAttribute('name')).toBe(false))
  })

  it('reads a dropped file', async () => {
    returns(CSF_FISICA_LINES)
    const { container } = setup()
    const zone = container.querySelector('[data-sf-reader-zone]')!
    fireEvent.dragOver(zone)
    expect(zone.getAttribute('data-dragging')).toBe('')
    expect(container.textContent).toContain('Suelta el archivo para leerlo')
    fireEvent.drop(zone, { dataTransfer: { files: [pdf()] } })
    expect(await screen.findByRole('heading', { name: 'Revisa tus datos' })).toBeTruthy()
  })
})

describe('<IdentityDocumentReader /> reading and review', () => {
  it('persona física with two regimes: prefilled, marked, regime is a radio group the buyer must choose', async () => {
    returns(CSF_FISICA_LINES)
    qr.mockResolvedValue(QR_URL_FISICA)
    const { container, upload } = setup()
    upload(pdf())
    await screen.findByRole('heading', { name: 'Revisa tus datos' })
    const val = (n: string) => container.querySelector<HTMLInputElement>(`[name="invoice.${n}"]`)!.value
    expect(val('tax_id')).toBe(RFC_FISICA)
    expect(val('legal_name')).toBe('JUAN CARLOS PEREZ PEREZ')
    expect(val('postal_code')).toBe('06600')
    // The fields that came from the document say so, with text.
    expect(container.querySelectorAll('[data-sf-from-document]').length).toBeGreaterThanOrEqual(3)
    expect(container.textContent).toContain('De tu constancia de situación fiscal')
    const radios = [...container.querySelectorAll<HTMLInputElement>('input[type=radio][name="invoice.tax_regime"]')]
    expect(radios.map((r) => r.value).sort()).toEqual(['605', '612'])
    expect(radios.every((r) => !r.checked)).toBe(true)
    // QR agrees and the document is fresh: no warnings.
    expect(container.querySelector('[data-sf-reader-warnings]')).toBeNull()
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })

  it('the use list follows the regime that was chosen', async () => {
    returns(CSF_FISICA_LINES)
    const { container, upload } = setup()
    upload(pdf())
    await screen.findByRole('heading', { name: 'Revisa tus datos' })
    const uses = () => [...container.querySelectorAll<HTMLOptionElement>('select[name="invoice.use"] option')].map((o) => o.value).filter(Boolean)
    const all = uses().length
    fireEvent.click(container.querySelector('input[type=radio][value="605"]')!)
    const for605 = uses()
    expect(for605.length).toBeGreaterThan(0)
    expect(for605.length).toBeLessThan(all)
    const expected = MOCK_REGION_MX.fiscal_id!.invoice_uses.filter((u) => !u.allowed_regimes?.length || u.allowed_regimes.includes('605')).map((u) => u.code)
    expect(for605.sort()).toEqual(expected.sort())
  })

  it('persona moral: one regime, preselected, a select; confirming delivers values and evidence (no file)', async () => {
    returns(CSF_MORAL_LINES)
    const { container, upload, onConfirm } = setup()
    upload(pdf())
    await screen.findByRole('heading', { name: 'Revisa tus datos' })
    const sel = container.querySelector<HTMLSelectElement>('select[name="invoice.tax_regime"]')!
    expect(sel.value).toBe('601')
    expect(container.querySelector<HTMLInputElement>('[name="invoice.tax_id"]')!.value).toBe(RFC_MORAL)
    fireEvent.change(container.querySelector('select[name="invoice.use"]')!, { target: { value: 'G03' } })
    fireEvent.click(screen.getByRole('button', { name: 'Usar estos datos' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    const r = onConfirm.mock.calls[0]![0]
    expect(r.values).toMatchObject({ tax_id: RFC_MORAL, tax_regime: '601', use: 'G03' })
    expect(r.evidence).toMatchObject({ kind: 'MX:csf', source: 'pdf_client', sha256: SHA, extractor: 'rules@1' })
    expect(r.save).toBe(false)
    // The evidence travels in the form too, so the checkout can post it.
    expect(JSON.parse(container.querySelector<HTMLInputElement>('input[name="invoice.document"]')!.value)).toMatchObject({ kind: 'MX:csf', sha256: SHA })
  })

  it('the CURP and the street never appear: not in the DOM, not in the values, not in the evidence', async () => {
    returns(CSF_FISICA_LINES)
    const { container, upload, onConfirm } = setup()
    upload(pdf())
    await screen.findByRole('heading', { name: 'Revisa tus datos' })
    fireEvent.click(container.querySelector('input[type=radio][value="612"]')!)
    fireEvent.change(container.querySelector('select[name="invoice.use"]')!, { target: { value: 'G03' } })
    fireEvent.click(screen.getByRole('button', { name: 'Usar estos datos' }))
    const everything = container.innerHTML + JSON.stringify(onConfirm.mock.calls) + [...container.querySelectorAll('input')].map((i) => i.value).join('|')
    expect(everything).not.toContain(CURP_FISICA)
    expect(everything).not.toMatch(/REFORMA|JUAREZ/)
  })

  it('warns, without blocking, when the QR does not match the text', async () => {
    returns(CSF_FISICA_LINES)
    qr.mockResolvedValue(QR_URL_OTRO)
    const { container, upload } = setup()
    upload(pdf())
    await screen.findByRole('heading', { name: 'Revisa tus datos' })
    const warn = container.querySelector('[data-sf-reader-warnings]')!
    expect(warn.textContent).toContain('El código QR de tu documento no coincide')
    expect(warn.textContent).toContain('⚠') // not color alone
    expect(container.querySelector<HTMLInputElement>('[name="invoice.tax_id"]')!.value).toBe(RFC_FISICA)
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })

  it('warns when the document is older than freshness_days', async () => {
    returns(CSF_FISICA_LINES)
    const { container, upload } = setup({ now: () => new Date('2024-09-01T12:00:00Z') })
    upload(pdf())
    await screen.findByRole('heading', { name: 'Revisa tus datos' })
    expect(container.querySelector('[data-sf-reader-warnings]')!.textContent).toMatch(/Tu documento tiene 170 días de emitido/)
  })

  it('says so when no regime was detected and lets the buyer choose', async () => {
    returns(CSF_FISICA_LINES.filter((l) => !/^Régimen|^Regímenes/.test(l)))
    const { container, upload } = setup()
    upload(pdf())
    await screen.findByRole('heading', { name: 'Revisa tus datos' })
    expect(container.querySelector('[data-sf-reader-warnings]')!.textContent).toContain('No pudimos detectar tu régimen')
    expect(container.querySelector('select[name="invoice.tax_regime"]')).toBeTruthy()
  })

  it('announces reading in a live region and can be cancelled', async () => {
    let release!: (v: Awaited<ReturnType<typeof readPdfText>>) => void
    read.mockReturnValue(new Promise((r) => (release = r)))
    const { container, upload } = setup()
    const live = container.querySelector('[role=status][aria-live=polite]')!
    upload(pdf())
    await waitFor(() => expect(live.textContent).toBe('Leyendo tu constancia de situación fiscal…'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(container.querySelector('input[type=file]')).toBeTruthy()
    expect(live.textContent).toBe('')
    release({ text: CSF_FISICA_LINES.join('\n'), pages: 1, sha256: SHA })
    await new Promise((r) => setTimeout(r, 10))
    // A cancelled read does not come back to life.
    expect(screen.queryByRole('heading', { name: 'Revisa tus datos' })).toBeNull()
  })

  it('asks for the missing fields with a summary that takes focus and links to them', async () => {
    returns(CSF_MORAL_LINES)
    const { container, upload, onConfirm } = setup()
    upload(pdf())
    await screen.findByRole('heading', { name: 'Revisa tus datos' })
    fireEvent.click(screen.getByRole('button', { name: 'Usar estos datos' }))
    expect(onConfirm).not.toHaveBeenCalled()
    const summary = container.querySelector<HTMLElement>('[data-sf-error-summary]')!
    expect(summary.getAttribute('role')).toBe('alert')
    await waitFor(() => expect(document.activeElement).toBe(summary))
    const link = summary.querySelector<HTMLAnchorElement>('a[href$="-use"]')!
    expect(link.textContent).toContain('Uso de la factura')
    fireEvent.click(link)
    expect(document.activeElement).toBe(container.querySelector('select[name="invoice.use"]'))
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })

  it('validates the tax id format against the region while reviewing', async () => {
    returns(CSF_MORAL_LINES)
    const { container, upload, onConfirm } = setup()
    upload(pdf())
    await screen.findByRole('heading', { name: 'Revisa tus datos' })
    const tax = container.querySelector<HTMLInputElement>('[name="invoice.tax_id"]')!
    fireEvent.change(tax, { target: { value: 'abc 123' } })
    expect(tax.value).toBe('ABC123') // uppercase, no spaces
    fireEvent.blur(tax)
    expect(container.querySelector('[data-sf-field-error]')!.textContent).toContain('RFC no válido')
    expect(tax.getAttribute('aria-invalid')).toBe('true')
    fireEvent.change(container.querySelector('select[name="invoice.use"]')!, { target: { value: 'G03' } })
    fireEvent.click(screen.getByRole('button', { name: 'Usar estos datos' }))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('offers "save to my account" only for a signed-in buyer and reports it', async () => {
    returns(CSF_MORAL_LINES)
    const a = setup()
    a.upload(pdf())
    await screen.findByRole('heading', { name: 'Revisa tus datos' })
    expect(a.container.querySelector('[data-sf-reader-save]')).toBeNull()
    a.unmount()
    const b = setup({ canSave: true })
    b.upload(pdf())
    await screen.findByRole('heading', { name: 'Revisa tus datos' })
    fireEvent.click(screen.getByLabelText(/Guardar en mi cuenta/))
    fireEvent.change(b.container.querySelector('select[name="invoice.use"]')!, { target: { value: 'G03' } })
    fireEvent.click(screen.getByRole('button', { name: 'Usar estos datos' }))
    expect(b.onConfirm.mock.calls[0]![0].save).toBe(true)
  })
})

describe('<IdentityDocumentReader /> errors', () => {
  const alertText = (c: HTMLElement) => c.querySelector('[role=alert]')!.textContent
  it('rejects a file that is not a PDF before reading it', async () => {
    const { container, upload } = setup()
    upload(pdf('foto.png', 'image/png'))
    await waitFor(() => expect(alertText(container)).toContain('no es un PDF'))
    expect(read).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(container.querySelector('[role=alert]'))
  })

  it('rejects a file over the size limit with the limit in the text', async () => {
    const { container, upload } = setup()
    upload(pdf('c.pdf', 'application/pdf', 6 * 1024 * 1024))
    await waitFor(() => expect(alertText(container)).toContain('más de 5 MB'))
    expect(read).not.toHaveBeenCalled()
  })

  it.each([
    ['no_text', 'imagen escaneada'],
    ['password', 'tiene contraseña'],
    ['unreadable', 'No pudimos leer este archivo'],
  ] as const)('%s: says what happened and offers manual entry', async (code, text) => {
    read.mockRejectedValue(new IdentityDocumentError(code, 'x'))
    const { container, upload } = setup()
    upload(pdf())
    await waitFor(() => expect(alertText(container)).toContain(text))
    expect(container.querySelector('[data-sf-reader-error]')!.getAttribute('data-sf-reader-error')).toBe(code)
    fireEvent.click(screen.getByRole('button', { name: 'Captura tus datos a mano' }))
    expect(await screen.findByRole('heading', { name: 'Revisa tus datos' })).toBeTruthy()
    expect(container.querySelector<HTMLInputElement>('[name="invoice.tax_id"]')!.value).toBe('')
    expect(container.querySelector('input[name="invoice.document"]')).toBeNull() // nothing was read: no evidence
  })

  it('a reader that cannot start pdf.js (no worker) falls back to manual entry, not a crash', async () => {
    read.mockRejectedValue(new TypeError('set workerSrc'))
    const { container, upload } = setup({ workerSrc: undefined })
    upload(pdf())
    await waitFor(() => expect(alertText(container)).toContain('No pudimos leer este archivo'))
  })

  it('English texts with locale="en"', async () => {
    const { container } = setup({ locale: 'en' })
    expect(container.textContent).toContain('We read it on your device')
    expect(container.textContent).toContain('Enter your details by hand')
  })
})

describe('<IdentityDocumentReader /> from the server (no JavaScript)', () => {
  it('renders the review from the action result, marked, with the evidence as a hidden field', () => {
    const evidence = { kind: 'MX:csf', document_id: ID_CIF_FISICA, source: 'pdf_server' as const, sha256: SHA, extractor: 'rules@1', qr_match: null }
    const { container } = setup({
      data: {
        ok: true,
        step: 'review',
        extraction: {
          kind: 'MX:csf',
          values: { tax_id: RFC_MORAL, legal_name: 'EMPRESA DE PRUEBA SA DE CV', postal_code: '44100', tax_regime: '601' },
          regime_candidates: ['601'],
          from_document: ['tax_id', 'legal_name', 'postal_code', 'tax_regime'],
          qr_match: null,
          stale: false,
          age_days: 10,
          missing: [],
          evidence,
        },
      },
    })
    expect(screen.getByRole('heading', { name: 'Revisa tus datos' })).toBeTruthy()
    expect(container.querySelector<HTMLInputElement>('[name="invoice.tax_id"]')!.value).toBe(RFC_MORAL)
    expect(JSON.parse(container.querySelector<HTMLInputElement>('input[name="invoice.document"]')!.value).source).toBe('pdf_server')
  })

  it('shows a server read error', () => {
    const { container } = setup({ data: { ok: false, error: { code: 'no_text' } } })
    expect(container.querySelector('[role=alert]')!.textContent).toContain('imagen escaneada')
  })
})
