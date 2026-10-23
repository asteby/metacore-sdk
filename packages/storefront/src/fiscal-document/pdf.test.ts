import { afterEach, describe, expect, it, vi } from 'vitest'
import { MOCK_FISCAL_ID_MX, MOCK_IDENTITY_DOCUMENT_MX_CSF as CSF } from '../mock/region.js'
import {
  IdentityDocumentError,
  buildDocumentEvidence,
  decodePdfQr,
  extractIdentityDocument,
  isIdentityDocumentError,
  readPdfText,
  setPdfjsLoader,
  sha256Hex,
} from './index.js'
import type { PdfjsLike } from './index.js'
import { makeTextPdf } from './__fixtures__/pdf.js'
import { QR_MATRIX_FISICA } from './__fixtures__/qr.js'
import { CSF_FISICA, CSF_FISICA_LINES, CSF_MORAL_LINES, CURP_FISICA, ID_CIF_FISICA, LOCKED_PDF_BASE64, QR_URL_FISICA, QR_URL_OTRO, RFC_FISICA } from './__fixtures__/csf.js'

const bytesOf = (b64: string) => Uint8Array.from(Buffer.from(b64, 'base64'))
const code = async (p: Promise<unknown>) => p.then(() => 'resolved', (e: unknown) => (isIdentityDocumentError(e) ? e.code : `other:${String(e)}`))

afterEach(() => {
  setPdfjsLoader(undefined)
  vi.unstubAllGlobals()
})

describe('readPdfText (real pdf.js, Node)', () => {
  it('reads a PDF into lines, with its page count and SHA-256', async () => {
    const pdf = makeTextPdf([['Linea uno', 'RFC: ' + RFC_FISICA], ['Pagina dos']])
    const res = await readPdfText(pdf)
    expect(res.text).toBe(`Linea uno\nRFC: ${RFC_FISICA}\n\nPagina dos`)
    expect(res.pages).toBe(2)
    expect(res.sha256).toBe(await sha256Hex(pdf))
    expect(res.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('accepts a File, a Blob, an ArrayBuffer and a Node Buffer', async () => {
    const pdf = makeTextPdf([['Constancia sintetica de prueba']])
    const buf = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer
    for (const src of [new File([pdf as BlobPart], 'c.pdf', { type: 'application/pdf' }), new Blob([pdf as BlobPart]), buf, Buffer.from(pdf)]) {
      expect((await readPdfText(src)).text).toBe('Constancia sintetica de prueba')
    }
  })

  it('does not consume the caller buffer (pdf.js transfers what it is given)', async () => {
    const pdf = makeTextPdf([['Constancia sintetica de prueba']])
    await readPdfText(pdf)
    expect(pdf.byteLength).toBeGreaterThan(100)
    await expect(readPdfText(pdf)).resolves.toMatchObject({ pages: 1 })
  })

  it('end to end: a synthetic constancia PDF yields the fiscal data and never the CURP', async () => {
    const { text, sha256 } = await readPdfText(makeTextPdf([CSF_FISICA_LINES]))
    const x = extractIdentityDocument(text, CSF, { catalogs: { regimes: MOCK_FISCAL_ID_MX.regimes }, qr: QR_URL_FISICA })
    expect(x.fields).toMatchObject({ tax_id: RFC_FISICA, legal_name: 'JUAN PEREZ PEREZ', postal_code: '06600', regimes: ['612', '605'], document_id: ID_CIF_FISICA })
    expect(x.qr.match).toBe(true)
    expect(JSON.stringify(x)).not.toContain(CURP_FISICA)
    expect(buildDocumentEvidence(x, { sha256, source: 'pdf_client' })).toMatchObject({ kind: 'MX:csf', document_id: ID_CIF_FISICA, sha256, source: 'pdf_client', qr_match: true })

    const moral = await readPdfText(makeTextPdf([CSF_MORAL_LINES]))
    expect(extractIdentityDocument(moral.text, CSF, { catalogs: { regimes: MOCK_FISCAL_ID_MX.regimes } }).fields.regimes).toEqual(['601'])
  })

  it('a QR from another document does not match', async () => {
    const { text } = await readPdfText(makeTextPdf([CSF_FISICA_LINES]))
    expect(extractIdentityDocument(text, CSF, { catalogs: { regimes: MOCK_FISCAL_ID_MX.regimes }, qr: QR_URL_OTRO }).qr.match).toBe(false)
  })
})

describe('readPdfText errors', () => {
  it('too_large by bytes, before reading anything', async () => {
    const pdf = makeTextPdf([['Constancia sintetica de prueba']])
    expect(await code(readPdfText(pdf, { maxBytes: 100 }))).toBe('too_large')
    expect(await code(readPdfText(new Blob([pdf as BlobPart]), { maxBytes: 100 }))).toBe('too_large')
  })

  it('too_large by pages', async () => {
    const pdf = makeTextPdf(Array.from({ length: 4 }, (_, i) => [`Pagina numero ${i + 1} de prueba`]))
    const err = await readPdfText(pdf, { maxPages: 3 }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(IdentityDocumentError)
    expect(err).toMatchObject({ code: 'too_large', reason: 'pages' })
  })

  it('not_pdf when the signature is missing', async () => {
    expect(await code(readPdfText(new TextEncoder().encode('<html>no soy un pdf</html>')))).toBe('not_pdf')
    expect(await code(readPdfText(new Uint8Array(0)))).toBe('not_pdf')
  })

  it('unreadable for a corrupt PDF that has the signature', async () => {
    expect(await code(readPdfText(new TextEncoder().encode('%PDF-1.4\nesto no es un pdf valido\n')))).toBe('unreadable')
  })

  it('no_text for a PDF without a text layer (a scan)', async () => {
    expect(await code(readPdfText(makeTextPdf([[]])))).toBe('no_text')
  })

  it('password for an encrypted PDF', async () => {
    expect(await code(readPdfText(bytesOf(LOCKED_PDF_BASE64)))).toBe('password')
  })

  it('unreadable (timeout) when pdf.js never answers', async () => {
    setPdfjsLoader(async () => ({ getDocument: () => ({ promise: new Promise(() => undefined), destroy: () => undefined }) }) as unknown as PdfjsLike)
    const err = await readPdfText(makeTextPdf([['Constancia sintetica de prueba']]), { timeoutMs: 30 }).catch((e: unknown) => e)
    expect(err).toMatchObject({ code: 'unreadable', reason: 'timeout' })
  })

  it('unreadable (aborted) when the signal fires', async () => {
    setPdfjsLoader(async () => ({ getDocument: () => ({ promise: new Promise(() => undefined), destroy: () => undefined }) }) as unknown as PdfjsLike)
    const ac = new AbortController()
    const p = readPdfText(makeTextPdf([['Constancia sintetica de prueba']]), { signal: ac.signal, timeoutMs: 5000 })
    setTimeout(() => ac.abort(), 10)
    expect(await p.catch((e: unknown) => e)).toMatchObject({ code: 'unreadable', reason: 'aborted' })
  })

  it('never puts document text in an error message', async () => {
    const err = (await readPdfText(makeTextPdf([['RFC ' + RFC_FISICA]]), { minChars: 10_000 }).catch((e: unknown) => e)) as Error
    expect(err.message).not.toContain(RFC_FISICA)
  })

  it('in a browser, requires a self-hosted worker (no CDN default)', async () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', {})
    setPdfjsLoader(async () => ({ GlobalWorkerOptions: { workerSrc: '' }, getDocument: () => ({ promise: new Promise(() => undefined), destroy: () => undefined }) }) as unknown as PdfjsLike)
    await expect(readPdfText(makeTextPdf([['Constancia sintetica de prueba']]))).rejects.toThrow(/workerSrc/)
  })
})

describe('pdf.js is loaded on demand with eval disabled', () => {
  it('asks for the legacy build only when a document is read, with isEvalSupported:false', async () => {
    const seen: Record<string, unknown>[] = []
    const fake: PdfjsLike = {
      getDocument: (src) => {
        seen.push(src)
        return {
          promise: Promise.resolve({
            numPages: 1,
            getPage: async () => ({
              getTextContent: async () => ({ items: [{ str: 'Texto de prueba suficiente', transform: [1, 0, 0, 1, 0, 700] }] }),
              getViewport: () => ({ width: 10, height: 10 }),
              render: () => ({ promise: Promise.resolve() }),
            }),
            destroy: async () => undefined,
          }),
          destroy: async () => undefined,
        }
      },
    }
    const loader = vi.fn(async () => fake)
    setPdfjsLoader(loader)
    expect(loader).not.toHaveBeenCalled()
    await readPdfText(makeTextPdf([['x']]))
    expect(loader).toHaveBeenCalledTimes(1)
    expect(seen[0]).toMatchObject({ isEvalSupported: false, enableXfa: false, useWorkerFetch: false })
  })
})

describe('decodePdfQr', () => {
  it('is null in Node (no canvas) without throwing', async () => {
    expect(await decodePdfQr(makeTextPdf([['Constancia sintetica de prueba']]))).toBeNull()
  })

  it('renders the page and returns what the decoder finds, or null when it finds nothing', async () => {
    class FakeCanvas {
      constructor(
        readonly width: number,
        readonly height: number,
      ) {}
      getContext() {
        return { getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(4 * w * h), width: w, height: h }) }
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeCanvas)
    const render = vi.fn(() => ({ promise: Promise.resolve() }))
    setPdfjsLoader(async () => ({
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: async () => ({ getTextContent: async () => ({ items: [] }), getViewport: () => ({ width: 100, height: 120 }), render }),
          destroy: async () => undefined,
        }),
        destroy: async () => undefined,
      }),
    }))
    const pdf = makeTextPdf([['Constancia sintetica de prueba']])
    expect(await decodePdfQr(pdf, { decode: (img) => (img.width === 100 && img.height === 120 ? QR_URL_FISICA : null) })).toBe(QR_URL_FISICA)
    expect(render).toHaveBeenCalled()
    expect(await decodePdfQr(pdf, { decode: () => null })).toBeNull()
    expect(await decodePdfQr(pdf, { decode: () => Promise.reject(new Error('boom')) })).toBeNull()
  })

  it('decodes a real QR image with the optional jsqr package when the browser has no BarcodeDetector', async () => {
    const scale = 4
    const size = QR_MATRIX_FISICA.length * scale
    const data = new Uint8ClampedArray(size * size * 4)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dark = QR_MATRIX_FISICA[Math.floor(y / scale)]![Math.floor(x / scale)] === '1'
        data.set([dark ? 0 : 255, dark ? 0 : 255, dark ? 0 : 255, 255], (y * size + x) * 4)
      }
    }
    class QrCanvas {
      constructor(
        readonly width: number,
        readonly height: number,
      ) {}
      getContext() {
        return { getImageData: () => ({ data, width: size, height: size }) }
      }
    }
    vi.stubGlobal('OffscreenCanvas', QrCanvas)
    setPdfjsLoader(async () => ({
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: async () => ({ getTextContent: async () => ({ items: [] }), getViewport: () => ({ width: size, height: size }), render: () => ({ promise: Promise.resolve() }) }),
          destroy: async () => undefined,
        }),
        destroy: async () => undefined,
      }),
    }))
    const url = await decodePdfQr(makeTextPdf([['Constancia sintetica de prueba']]))
    expect(url).toBe(QR_URL_FISICA)
    const x = extractIdentityDocument(CSF_FISICA, CSF, { catalogs: { regimes: MOCK_FISCAL_ID_MX.regimes }, qr: url })
    expect(x.qr.match).toBe(true)
  })

  it('still reports the typed errors of opening the file', async () => {
    expect(await code(decodePdfQr(bytesOf(LOCKED_PDF_BASE64)))).toBe('password')
    expect(await code(decodePdfQr(new TextEncoder().encode('nope')))).toBe('not_pdf')
  })
})
