/**
 * Reads a tax document uploaded without JavaScript, on the server, with the same engine the browser uses. In memory
 * only: the bytes are never written to disk, never logged and are dropped when this returns.
 */
import type { IdentityDocumentSpec, Region } from '@asteby/storefront'
import { IdentityDocumentError, buildDocumentEvidence, catalogsFromRegion, extractIdentityDocument, readPdfText } from '@asteby/storefront/fiscal-document'
import { summarizeExtraction } from './extraction.js'
import type { FiscalExtractionSummary } from './types.js'

export type UploadLimits = { maxBytes: number; maxPages: number; timeoutMs: number }

/** 5 MiB, 6 pages, 3 s: the same as the browser reader. */
export const UPLOAD_LIMITS: Readonly<UploadLimits> = Object.freeze({ maxBytes: 5 * 1024 * 1024, maxPages: 6, timeoutMs: 3000 })

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] // %PDF-

export async function extractUploadedDocument(
  file: Blob,
  spec: IdentityDocumentSpec,
  region: Pick<Region, 'fiscal_id'>,
  options: { limits?: Partial<UploadLimits>; now?: Date } = {},
): Promise<FiscalExtractionSummary> {
  const lim = { ...UPLOAD_LIMITS, ...options.limits }
  // The region can only lower the limits.
  const maxBytes = Math.min(lim.maxBytes, spec.max_bytes || lim.maxBytes)
  const maxPages = Math.min(lim.maxPages, spec.max_pages || lim.maxPages)
  if (file.size > maxBytes) throw new IdentityDocumentError('too_large', 'file over the size limit', { reason: 'bytes' })
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!PDF_MAGIC.every((b, i) => bytes[i] === b)) throw new IdentityDocumentError('not_pdf', 'not a PDF')
  // The engine is the only reader. QR cross-check needs a canvas, which a server does not have: `qr_match` stays null.
  const { text, sha256 } = await readPdfText(bytes, { maxBytes, maxPages, timeoutMs: lim.timeoutMs })
  const x = extractIdentityDocument(text, spec, {
    catalogs: region.fiscal_id ? catalogsFromRegion(region.fiscal_id) : {},
    ...(options.now ? { now: options.now } : {}),
  })
  return summarizeExtraction(x, buildDocumentEvidence(x, { sha256, source: 'pdf_server' }), region.fiscal_id?.regimes.map((r) => r.code))
}
