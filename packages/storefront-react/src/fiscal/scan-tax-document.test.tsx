// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { MOCK_REGION_MX } from '@asteby/storefront/mock'
import { decodeImageQr, readPdfText } from '@asteby/storefront/fiscal-document'
import type { Region } from '@asteby/storefront'
import { IdentityDocumentReader, ScanTaxDocument, type FiscalReaderResult } from './index.js'
import { CSF_FISICA_LINES, ID_CIF_FISICA, QR_URL_FISICA, RFC_FISICA } from './__fixtures__/csf.js'

vi.mock('@asteby/storefront/fiscal-document', async (orig) => {
  const actual = await orig<typeof import('@asteby/storefront/fiscal-document')>()
  return { ...actual, readPdfText: vi.fn(), decodePdfQr: vi.fn(async () => null), decodeImageQr: vi.fn() }
})

const image = vi.mocked(decodeImageQr)
const pdfText = vi.mocked(readPdfText)
const AXE = { rules: { 'color-contrast': { enabled: false } } }
const FRESH = () => new Date('2024-04-01T12:00:00Z')
const photo = (name = 'qr.jpg', type = 'image/jpeg') => new File([new Uint8Array(100)], name, { type })

const regionWith = (patch: Record<string, unknown>): Region => ({
  ...MOCK_REGION_MX,
  fiscal_id: { ...MOCK_REGION_MX.fiscal_id!, documents: [{ ...MOCK_REGION_MX.fiscal_id!.documents![0]!, ...patch }] },
})

beforeEach(() => {
  image.mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function setup(region: Region = MOCK_REGION_MX) {
  const onConfirm = vi.fn<(r: FiscalReaderResult) => void>()
  const utils = render(<IdentityDocumentReader region={region} onConfirm={onConfirm} now={FRESH} />)
  const photoInput = () => utils.container.querySelector<HTMLInputElement>('[data-sf-reader-photo-input]')
  return { ...utils, onConfirm, photoInput }
}

describe('<IdentityDocumentReader /> photo of the QR (image_mode)', () => {
  it('offers the photo only when the region allows it, and the file picker stays on the PDF', async () => {
    const on = setup()
    expect(screen.getByRole('button', { name: 'Tomar foto del QR' })).toBeTruthy()
    expect(on.photoInput()!.accept).toBe('image/*')
    expect(on.photoInput()!.getAttribute('capture')).toBe('environment')
    expect(on.container.querySelector<HTMLInputElement>('input[type=file]:not([hidden])')!.accept).toBe('application/pdf')
    expect((await axe.run(on.container, AXE)).violations).toEqual([])
    on.unmount()
    const off = setup(regionWith({ image_mode: 'none' }))
    expect(off.photoInput()).toBeNull()
    expect(screen.queryByRole('button', { name: 'Tomar foto del QR' })).toBeNull()
  })

  it('a region without image_mode (an older server) shows no photo controls', () => {
    const { photoInput } = setup(regionWith({ image_mode: undefined }))
    expect(photoInput()).toBeNull()
  })

  it('reads the QR of a photo: tax id and document id only, marked as such, evidence from the QR', async () => {
    image.mockResolvedValue(QR_URL_FISICA)
    const { container, photoInput, onConfirm } = setup()
    fireEvent.change(photoInput()!, { target: { files: [photo()] } })
    await screen.findByRole('heading', { name: 'Revisa tus datos' })
    expect(container.querySelector<HTMLInputElement>('[name="invoice.tax_id"]')!.value).toBe(RFC_FISICA)
    expect(container.querySelector<HTMLInputElement>('[name="invoice.legal_name"]')!.value).toBe('')
    expect(container.querySelector('[data-sf-reader-warnings]')!.textContent).toContain('Del código QR solo leímos tu identificador fiscal')
    // The buyer completes the rest and confirms: the evidence says the data came from the QR, never a file hash.
    // (The synthetic RFC of the fixture ends in a letter the region's pattern rejects: the buyer corrects it.)
    fireEvent.change(container.querySelector('[name="invoice.tax_id"]')!, { target: { value: 'PEPJ800101AB3' } })
    fireEvent.change(container.querySelector('[name="invoice.legal_name"]')!, { target: { value: 'Juan Carlos Pérez Pérez' } })
    fireEvent.change(container.querySelector('[name="invoice.postal_code"]')!, { target: { value: '06600' } })
    fireEvent.change(container.querySelector('select[name="invoice.tax_regime"]')!, { target: { value: '612' } })
    expect((container.querySelector('select[name="invoice.use"]') as HTMLSelectElement).value).toBe('G03') // the region's suggestion
    fireEvent.click(screen.getByRole('button', { name: 'Usar estos datos' }))
    const r = onConfirm.mock.calls[0]![0]
    expect(r.evidence).toMatchObject({ kind: 'MX:csf', source: 'qr', document_id: ID_CIF_FISICA })
    expect(r.evidence).not.toHaveProperty('sha256', expect.any(String))
    expect(r.values).toMatchObject({ tax_id: 'PEPJ800101AB3', tax_regime: '612', use: 'G03' })
    // The photo is not part of anything the component keeps or posts.
    expect(container.innerHTML).not.toContain('qr.jpg')
  })

  it('says there is no QR when the photo has none, and offers the way out', async () => {
    image.mockResolvedValue(null)
    const { container, photoInput } = setup()
    fireEvent.change(photoInput()!, { target: { files: [photo()] } })
    await waitFor(() => expect(container.querySelector('[role=alert]')!.textContent).toContain('No encontramos el código QR'))
    expect(screen.getByRole('button', { name: 'Captura tus datos a mano' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Subir otro archivo' })).toBeTruthy()
  })

  it('a QR that is not of this document (no tax id) is also "no QR"', async () => {
    image.mockResolvedValue('https://example.com/not-a-tax-document')
    const { container, photoInput } = setup()
    fireEvent.change(photoInput()!, { target: { files: [photo()] } })
    await waitFor(() => expect(container.querySelector('[role=alert]')!.textContent).toContain('No encontramos el código QR'))
  })

  it('maps the engine errors (too large, not an image) to messages', async () => {
    image.mockRejectedValue(Object.assign(new Error('x'), { code: 'not_image' }))
    const { container, photoInput } = setup()
    fireEvent.change(photoInput()!, { target: { files: [photo('x.jpg')] } })
    await waitFor(() => expect(container.querySelector('[role=alert]')!.textContent).toContain('no es una foto que podamos leer'))
  })

  it('a photo dropped on the zone is read too; with image_mode none it is "not a PDF"', async () => {
    image.mockResolvedValue(QR_URL_FISICA)
    const on = setup()
    fireEvent.change(on.container.querySelector<HTMLInputElement>('input[type=file]:not([hidden])')!, { target: { files: [photo()] } })
    await screen.findByRole('heading', { name: 'Revisa tus datos' })
    on.unmount()
    const off = setup(regionWith({ image_mode: 'none' }))
    fireEvent.change(off.container.querySelector<HTMLInputElement>('input[type=file]')!, { target: { files: [photo()] } })
    await waitFor(() => expect(off.container.querySelector('[role=alert]')!.textContent).toContain('no es un PDF'))
    expect(image).toHaveBeenCalledTimes(1)
  })
})

describe('<IdentityDocumentReader /> live camera', () => {
  function fakeCamera() {
    const stop = vi.fn()
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream
    // happy-dom only accepts its own MediaStream in `srcObject`: keep the stub in a plain property.
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
      configurable: true,
      get(this: { _src?: unknown }) {
        return this._src ?? null
      },
      set(this: { _src?: unknown }, v: unknown) {
        this._src = v
      },
    })
    const getUserMedia = vi.fn(async () => stream)
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } })
    Object.defineProperty(HTMLVideoElement.prototype, 'readyState', { configurable: true, get: () => 4 })
    Object.defineProperty(HTMLVideoElement.prototype, 'play', { configurable: true, value: () => Promise.resolve() })
    return { stop, getUserMedia }
  }

  it('opens the viewfinder, reads the code, stops the camera and goes to the review', async () => {
    const cam = fakeCamera()
    image.mockResolvedValueOnce(null).mockResolvedValue(QR_URL_FISICA)
    const { container } = setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Escanear con la cámara' }))
    expect(await screen.findByRole('heading', { name: 'Apunta al código QR' })).toBeTruthy()
    expect(cam.getUserMedia).toHaveBeenCalledWith({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    expect(container.querySelector('video')!.getAttribute('aria-label')).toBe('Centra el código QR dentro del marco.')
    await screen.findByRole('heading', { name: 'Revisa tus datos' }, { timeout: 3000 })
    expect(cam.stop).toHaveBeenCalled()
    expect(container.querySelector<HTMLInputElement>('[name="invoice.tax_id"]')!.value).toBe(RFC_FISICA)
    expect(container.querySelector('[role=status]')!.textContent).toContain('Código leído')
  })

  it('closing the viewfinder, or unmounting, stops the camera', async () => {
    const cam = fakeCamera()
    image.mockResolvedValue(null)
    const { unmount } = setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Escanear con la cámara' }))
    await waitFor(() => expect(cam.getUserMedia).toHaveBeenCalled())
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar la cámara' }))
    await waitFor(() => expect(cam.stop).toHaveBeenCalled())
    expect(screen.getByRole('heading', { name: /Sube tu/ })).toBeTruthy()
    cam.stop.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Escanear con la cámara' }))
    await waitFor(() => expect(cam.getUserMedia).toHaveBeenCalledTimes(2))
    unmount()
    await waitFor(() => expect(cam.stop).toHaveBeenCalled())
  })

  it('a refused camera says so and keeps the photo and the PDF as ways out', async () => {
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia: vi.fn(async () => Promise.reject(new Error('NotAllowedError'))) } })
    const { container } = setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Escanear con la cámara' }))
    await waitFor(() => expect(container.querySelector('[data-sf-reader-camera-status]')!.getAttribute('data-sf-reader-camera-status')).toBe('denied'))
    expect(container.textContent).toContain('No pudimos usar la cámara')
    expect(screen.getByRole('button', { name: 'Elegir una foto' })).toBeTruthy()
  })

  it('without getUserMedia the camera button does not exist', () => {
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: undefined })
    setup()
    expect(screen.queryByRole('button', { name: 'Escanear con la cámara' })).toBeNull()
  })
})

describe('suggested invoice use after reading a document', () => {
  it('preselects the use the region suggests for the regime, marked, and the buyer can change it', async () => {
    pdfText.mockResolvedValue({ text: CSF_FISICA_LINES.join('\n'), pages: 1, sha256: 'ab'.repeat(32) })
    const { container } = setup()
    fireEvent.change(container.querySelector<HTMLInputElement>('input[type=file]:not([hidden])')!, { target: { files: [new File(['%PDF-1.4'], 'c.pdf', { type: 'application/pdf' })] } })
    await screen.findByRole('heading', { name: 'Revisa tus datos' })
    // Two regimes in the document: the buyer picks one; the suggestion follows the choice.
    expect((container.querySelector('select[name="invoice.use"]') as HTMLSelectElement).value).toBe('')
    fireEvent.click(container.querySelector('input[type=radio][value="612"]')!)
    expect((container.querySelector('select[name="invoice.use"]') as HTMLSelectElement).value).toBe('G03')
    expect(container.querySelector('[data-sf-suggested]')!.textContent).toBe('Sugerido')
    fireEvent.change(container.querySelector('select[name="invoice.use"]')!, { target: { value: 'I01' } })
    expect(container.querySelector('[data-sf-suggested]')).toBeNull()
  })
})

describe('<ScanTaxDocument />', () => {
  it('names the region document on the button, opens a sheet and closes it when the buyer chooses manual entry', () => {
    const onManual = vi.fn()
    const { container } = render(<ScanTaxDocument region={MOCK_REGION_MX} onConfirm={vi.fn()} onManual={onManual} />)
    expect(screen.getByRole('button', { name: 'Escanear Constancia de situación fiscal' })).toBeTruthy()
    expect(container.querySelector('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Escanear Constancia de situación fiscal' }))
    const sheet = container.querySelector('dialog')!
    expect(sheet.getAttribute('aria-modal')).toBe('true')
    expect(sheet.querySelector('[data-sf-document-reader]')).toBeTruthy()
    fireEvent.click(sheet.querySelector('[data-sf-reader-manual]')!)
    expect(onManual).toHaveBeenCalledTimes(1)
    expect(container.querySelector('dialog')).toBeNull()
  })

  it('confirming inside the sheet closes it and delivers the result', async () => {
    image.mockResolvedValue(QR_URL_FISICA)
    const onConfirm = vi.fn<(r: FiscalReaderResult) => void>()
    const { container } = render(<ScanTaxDocument region={MOCK_REGION_MX} onConfirm={onConfirm} onManual={vi.fn()} now={FRESH} />)
    fireEvent.click(screen.getByRole('button', { name: /Escanear/ }))
    fireEvent.change(container.querySelector('[data-sf-reader-photo-input]')!, { target: { files: [photo()] } })
    await screen.findByRole('heading', { name: 'Revisa tus datos' })
    fireEvent.change(container.querySelector('[name="invoice.tax_id"]')!, { target: { value: 'PEPJ800101AB3' } })
    fireEvent.change(container.querySelector('[name="invoice.legal_name"]')!, { target: { value: 'Juan' } })
    fireEvent.change(container.querySelector('[name="invoice.postal_code"]')!, { target: { value: '06600' } })
    fireEvent.change(container.querySelector('select[name="invoice.tax_regime"]')!, { target: { value: '612' } })
    fireEvent.click(screen.getByRole('button', { name: 'Usar estos datos' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(container.querySelector('dialog')).toBeNull()
  })

  it('keeps the header outside the scrolling body and locks the page scroll while open', () => {
    const { container } = render(<ScanTaxDocument region={MOCK_REGION_MX} onConfirm={vi.fn()} onManual={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Escanear/ }))
    const sheet = container.querySelector('dialog')!
    const header = sheet.querySelector('[data-sf-scan-header]')!
    const body = sheet.querySelector('[data-sf-scan-body]')!
    expect(body.contains(header)).toBe(false)
    expect(header.querySelector('[data-sf-scan-close]')).toBeTruthy()
    expect(body.querySelector('[data-sf-reader-links]')).toBeTruthy()
    expect(document.documentElement.style.overflow).toBe('hidden')
    fireEvent.click(sheet.querySelector('[data-sf-scan-close]')!)
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('renders nothing when the region publishes no document (the caller shows the plain form)', () => {
    const none: Region = { ...MOCK_REGION_MX, fiscal_id: { ...MOCK_REGION_MX.fiscal_id!, documents: [] } }
    const { container } = render(<ScanTaxDocument region={none} onConfirm={vi.fn()} onManual={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })

  it('has no axe violations closed or open', async () => {
    const { container } = render(<ScanTaxDocument region={MOCK_REGION_MX} onConfirm={vi.fn()} onManual={vi.fn()} />)
    expect((await axe.run(container, AXE)).violations).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: /Escanear/ }))
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })
})

// pdf.js, jsqr and the camera engine must not be in the bundle of a page that never opens the reader: the engine is
// only imported with `import()` (on a chosen file, a photo or the camera), never statically.
describe('import graph', () => {
  it('no fiscal component imports the document engine statically', async () => {
    const { readFileSync, readdirSync } = await import('node:fs')
    const dir = `${process.cwd()}/src/fiscal`
    const offenders = readdirSync(dir)
      .filter((f) => /\.(tsx?|ts)$/.test(f) && !/\.test\./.test(f) && !/^server/.test(f)) // server entries run in Node and may import it
      .filter((f) => /^\s*import\s+(?!type\b)[^;]*from\s+['"]@asteby\/storefront\/fiscal-document['"]/m.test(readFileSync(`${dir}/${f}`, 'utf8')))
    expect(offenders).toEqual([])
  })
})
