import { IdentityDocumentError } from './errors.js'
import { openPdf, type PdfSource, type PdfPageLike, type ReadPdfOptions } from './pdf.js'

export type DecodePdfQrOptions = ReadPdfOptions & {
  /** Pages to scan, 1-based (default `[1]`, then the last page). */
  pages?: number[]
  /** Render scale (default 2: enough for a printed QR). */
  scale?: number
  /** Your own decoder for the rendered image (e.g. a server canvas in Node). Returns the QR text or `null`. */
  decode?: (image: ImageData) => string | null | Promise<string | null>
}

type CanvasLike = { width: number; height: number; getContext(kind: '2d'): unknown }

function makeCanvas(width: number, height: number): CanvasLike | null {
  const g = globalThis as { OffscreenCanvas?: new (w: number, h: number) => CanvasLike; document?: { createElement(tag: 'canvas'): CanvasLike } }
  if (g.OffscreenCanvas) return new g.OffscreenCanvas(width, height)
  if (g.document) {
    const c = g.document.createElement('canvas')
    c.width = width
    c.height = height
    return c
  }
  return null
}

async function decodeImage(image: ImageData, canvas: CanvasLike, custom?: DecodePdfQrOptions['decode']): Promise<string | null> {
  if (custom) return (await custom(image)) ?? null
  const Detector = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => { detect(i: unknown): Promise<{ rawValue: string }[]> } }).BarcodeDetector
  if (Detector) {
    try {
      const found = await new Detector({ formats: ['qr_code'] }).detect(canvas)
      if (found[0]?.rawValue) return found[0].rawValue
    } catch {
      /* fall through to jsQR */
    }
  }
  try {
    const mod = (await import('jsqr')) as unknown as { default: (d: Uint8ClampedArray, w: number, h: number) => { data: string } | null }
    return mod.default(image.data, image.width, image.height)?.data ?? null
  } catch {
    return null
  }
}

async function scan(page: PdfPageLike, scale: number, custom?: DecodePdfQrOptions['decode']): Promise<string | null> {
  const viewport = page.getViewport({ scale })
  const canvas = makeCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
  if (!canvas && !custom) return null
  const c = canvas ?? { width: Math.ceil(viewport.width), height: Math.ceil(viewport.height), getContext: () => null }
  const context = c.getContext('2d') as { getImageData(x: number, y: number, w: number, h: number): ImageData } | null
  if (!context) return null
  await page.render({ canvasContext: context, viewport }).promise
  return decodeImage(context.getImageData(0, 0, c.width, c.height), c, custom)
}

/**
 * Text of the first QR code found in a PDF (the document's validator URL), or `null`. Best effort: it needs a
 * canvas (browsers; Node has none unless you pass `decode` with your own), and `BarcodeDetector` or the
 * optional `jsqr` package, both loaded on demand. Anything that goes wrong yields `null`, except the
 * `IdentityDocumentError`s of opening the file (`too_large`, `not_pdf`, `password`, `unreadable`).
 */
export async function decodePdfQr(source: PdfSource, options: DecodePdfQrOptions = {}): Promise<string | null> {
  const opened = await openPdf(source, options)
  try {
    const last = opened.doc.numPages
    const wanted = options.pages ?? [1, last]
    const pages = [...new Set(wanted)].filter((n) => n >= 1 && n <= last)
    for (const n of pages) {
      try {
        const page = await opened.doc.getPage(n)
        const found = await scan(page, options.scale ?? 2, options.decode)
        page.cleanup?.()
        if (found) return found
      } catch (err) {
        if (err instanceof IdentityDocumentError) throw err
      }
    }
    return null
  } finally {
    await opened.destroy()
  }
}
