import { IdentityDocumentError } from './errors.js'
import { sha256Hex } from './text.js'

/** What `readPdfText` accepts: a browser `File`/`Blob`, or bytes (Node `Buffer` included). */
export type PdfSource = Blob | ArrayBuffer | ArrayBufferView

export type ReadPdfOptions = {
  /** Reject files larger than this (default 5 MiB). */
  maxBytes?: number
  /** Reject documents with more pages than this (default 6). */
  maxPages?: number
  /** Give up after this many ms (default 3000). */
  timeoutMs?: number
  /** Fewer non-space characters than this means "no text layer" (default 20). */
  minChars?: number
  /**
   * URL of the pdf.js worker (`pdf.worker.mjs` from `pdfjs-dist/legacy/build`) that YOUR site serves. Required in
   * browsers (there is deliberately no default and no CDN); ignored in Node, which needs no worker file.
   */
  workerSrc?: string
  /** Aborts the read. */
  signal?: AbortSignal
}

export type PdfTextResult = {
  /** Text of all pages, one line per visual line, pages separated by a blank line. */
  text: string
  pages: number
  /** SHA-256 of the file as received, lowercase hex (evidence for `FiscalDocumentEvidence.sha256`). */
  sha256: string
}

/** The slice of pdf.js these helpers use. */
export type PdfjsLike = {
  getDocument(src: Record<string, unknown>): { promise: Promise<PdfDocumentLike>; destroy(): Promise<void> | void }
  GlobalWorkerOptions?: { workerSrc: string }
}
export type PdfDocumentLike = {
  numPages: number
  getPage(n: number): Promise<PdfPageLike>
  destroy?(): Promise<void> | void
}
export type PdfPageLike = {
  getTextContent(): Promise<{ items: Array<{ str?: string; transform?: number[]; hasEOL?: boolean }> }>
  getViewport(o: { scale: number }): { width: number; height: number }
  render(o: { canvasContext: unknown; viewport: unknown }): { promise: Promise<void> }
  cleanup?(): void
}

export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024
export const DEFAULT_MAX_PAGES = 6
export const DEFAULT_TIMEOUT_MS = 3000

let custom: (() => Promise<PdfjsLike>) | undefined

/**
 * Replaces how pdf.js is loaded (tests, or a bundler that needs its own import). By default the legacy build of
 * `pdfjs-dist` is imported on first use, so it costs nothing until a document is read.
 */
export function setPdfjsLoader(loader: (() => Promise<PdfjsLike>) | undefined): void {
  custom = loader
}

export async function loadPdfjs(workerSrc?: string): Promise<PdfjsLike> {
  const mod = custom ? await custom() : ((await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfjsLike)
  if (workerSrc && mod.GlobalWorkerOptions) mod.GlobalWorkerOptions.workerSrc = workerSrc
  const inBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'
  if (inBrowser && !mod.GlobalWorkerOptions?.workerSrc) {
    throw new TypeError('readPdfText: set `workerSrc` to a pdf.worker.mjs your site serves (there is no default and no CDN)')
  }
  return mod
}

async function toBytes(source: PdfSource): Promise<Uint8Array> {
  if (typeof Blob !== 'undefined' && source instanceof Blob) return new Uint8Array(await source.arrayBuffer())
  if (source instanceof ArrayBuffer) return new Uint8Array(source)
  if (ArrayBuffer.isView(source)) return new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
  throw new TypeError('readPdfText: expected a File, Blob, ArrayBuffer or Uint8Array')
}

function sizeOf(source: PdfSource): number {
  if (typeof Blob !== 'undefined' && source instanceof Blob) return source.size
  return (source as ArrayBuffer | ArrayBufferView).byteLength
}

/** `%PDF-` at the very start: a cheap check before any parsing. */
export function hasPdfSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d
}

export type OpenedPdf = { bytes: Uint8Array; sha256: string; pdfjs: PdfjsLike; doc: PdfDocumentLike; destroy(): Promise<void> }

function mapPdfjsError(err: unknown): IdentityDocumentError {
  const name = (err as { name?: string } | null)?.name ?? ''
  if (name === 'PasswordException') return new IdentityDocumentError('password', 'The PDF is password protected', { cause: err })
  if (name === 'InvalidPDFException') return new IdentityDocumentError('unreadable', 'The PDF is corrupt or unsupported', { cause: err, reason: 'invalid' })
  return new IdentityDocumentError('unreadable', 'The PDF could not be read', { cause: err })
}

/** Validates the file, opens it with pdf.js and enforces the limits. The caller must `destroy()`. */
export async function openPdf(source: PdfSource, options: ReadPdfOptions = {}): Promise<OpenedPdf> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  if (sizeOf(source) > maxBytes) throw new IdentityDocumentError('too_large', `The file is larger than ${maxBytes} bytes`, { reason: 'bytes' })
  const bytes = await toBytes(source)
  if (bytes.byteLength > maxBytes) throw new IdentityDocumentError('too_large', `The file is larger than ${maxBytes} bytes`, { reason: 'bytes' })
  if (!hasPdfSignature(bytes)) throw new IdentityDocumentError('not_pdf', 'The file is not a PDF')
  const sha256 = await sha256Hex(bytes)
  if (options.signal?.aborted) throw new IdentityDocumentError('unreadable', 'Aborted', { reason: 'aborted' })

  const pdfjs = await loadPdfjs(options.workerSrc)
  // pdf.js takes ownership of `data` (it transfers it to the worker): give it a copy.
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    isEvalSupported: false,
    enableXfa: false,
    useSystemFonts: false,
    disableAutoFetch: true,
    disableStream: true,
    useWorkerFetch: false,
    verbosity: 0,
  })
  task.promise.catch(() => undefined)
  let doc: PdfDocumentLike | undefined
  const destroy = async () => {
    try {
      await (doc?.destroy ? doc.destroy() : task.destroy())
    } catch {
      /* already gone */
    }
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  let onAbort: (() => void) | undefined
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new IdentityDocumentError('unreadable', `Reading took longer than ${timeoutMs} ms`, { reason: 'timeout' })), timeoutMs)
    if (options.signal) {
      onAbort = () => reject(new IdentityDocumentError('unreadable', 'Aborted', { reason: 'aborted' }))
      options.signal.addEventListener('abort', onAbort, { once: true })
    }
  })
  const cleanup = () => {
    if (timer) clearTimeout(timer)
    if (onAbort) options.signal?.removeEventListener('abort', onAbort)
  }
  try {
    doc = await Promise.race([task.promise, limit])
    if (doc.numPages > maxPages) throw new IdentityDocumentError('too_large', `The PDF has more than ${maxPages} pages`, { reason: 'pages' })
    cleanup()
    // The deadline covers `readOpened` too: keep a fresh one there.
    return { bytes, sha256, pdfjs, doc, destroy }
  } catch (err) {
    cleanup()
    await destroy()
    throw err instanceof IdentityDocumentError ? err : mapPdfjsError(err)
  }
}

type Item = { str?: string; transform?: number[]; hasEOL?: boolean }

/** Joins the text items of a page into visual lines (top to bottom, left to right). */
export function itemsToLines(items: Item[]): string {
  const rows: { y: number; parts: { x: number; s: string }[] }[] = []
  for (const it of items) {
    const s = it.str
    if (!s || !s.trim()) continue
    const x = it.transform?.[4] ?? 0
    const y = it.transform?.[5] ?? 0
    const row = rows.find((r) => Math.abs(r.y - y) <= 2)
    if (row) row.parts.push({ x, s })
    else rows.push({ y, parts: [{ x, s }] })
  }
  rows.sort((a, b) => b.y - a.y)
  return rows.map((r) => r.parts.sort((a, b) => a.x - b.x).map((p) => p.s.trim()).join(' ')).join('\n')
}

/**
 * Text of a PDF, in the browser or in Node, with pdf.js (legacy build, `isEvalSupported: false`) imported on
 * demand. The file is read in memory: nothing is uploaded, written or logged. Throws `IdentityDocumentError`
 * (`too_large`, `not_pdf`, `unreadable`, `no_text`, `password`). In browsers pass `workerSrc`.
 */
export async function readPdfText(source: PdfSource, options: ReadPdfOptions = {}): Promise<PdfTextResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const opened = await openPdf(source, options)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const read = (async () => {
      const pages: string[] = []
      for (let n = 1; n <= opened.doc.numPages; n++) {
        const page = await opened.doc.getPage(n)
        pages.push(itemsToLines((await page.getTextContent()).items))
        page.cleanup?.()
      }
      return pages
    })()
    const limit = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new IdentityDocumentError('unreadable', `Reading took longer than ${timeoutMs} ms`, { reason: 'timeout' })), timeoutMs)
    })
    const pages = await Promise.race([read, limit])
    const text = pages.join('\n\n')
    if (text.replace(/\s+/g, '').length < (options.minChars ?? 20)) throw new IdentityDocumentError('no_text', 'The PDF has no text layer')
    return { text, pages: pages.length, sha256: opened.sha256 }
  } catch (err) {
    throw err instanceof IdentityDocumentError ? err : mapPdfjsError(err)
  } finally {
    if (timer) clearTimeout(timer)
    await opened.destroy()
  }
}
