import type { FiscalDocumentEvidence, FiscalDocumentSource, IdentityDocumentSpec, RegionFiscalEntry } from '../types.js'

/** A value read from a document: text, or the codes of a catalog (`catalog_phrases`). */
export type ExtractedValue = string | string[]

/** Catalogs the `catalog_phrases` strategy matches against, by name (`regimes` = `Region.fiscal_id.regimes`). */
export type IdentityCatalogs = Record<string, RegionFiscalEntry[]>

export type ExtractOptions = {
  /** Catalogs for `catalog_phrases`. Pass `{ regimes: region.fiscal_id.regimes }`. */
  catalogs?: IdentityCatalogs
  /** The text the QR of the document decoded to (`decodePdfQr`), to compare with the text. */
  qr?: string | null
  /** Clock for the freshness check (default `new Date()`). */
  now?: Date
}

export type IdentityExtraction = {
  /** `IdentityDocumentSpec.kind`. */
  kind: string
  /** `rules@1` or `plugin:<id>`. */
  extractor: string
  /**
   * What was read, by field. NEVER contains a `discard_fields` field, nor the value of one inside another field.
   * Conventional names: `tax_id`, `legal_name`, `postal_code`, `regimes` (codes), `document_id`, `issued_on`.
   */
  fields: Record<string, ExtractedValue>
  /** Fields the rules declare but the text did not yield. Show them empty for the buyer to fill in. */
  missing: string[]
  /** Names (never values) of the fields the spec discards: the store does not keep them, and the UI can say so. */
  discarded: string[]
  /** QR vs text. `match` is `null` when there was no QR or nothing to compare. */
  qr: { fields: Record<string, string>; match: boolean | null; mismatched: string[] }
  /** `issued_on` is older than `freshness_days`. `null` when it cannot be told. */
  stale: boolean | null
  age_days: number | null
}

/** Plugin extractor of a country whose document cannot be described with rules. Synchronous and pure. */
export type IdentityExtractorFn = (
  text: string,
  spec: IdentityDocumentSpec,
  options: ExtractOptions,
) => { fields: Record<string, ExtractedValue>; qr?: Record<string, string> }

export type EvidenceInput = {
  /** SHA-256 of the file (`PdfTextResult.sha256`). */
  sha256?: string | null
  source: FiscalDocumentSource
}

export type { FiscalDocumentEvidence }
