import type { FiscalDocumentEvidence, FiscalDocumentSource, IdentityDocumentSpec, RegionFiscalEntry } from '../types.js'

/** A value read from a document: text, or the codes of a catalog (`multiple` fields). */
export type ExtractedValue = string | string[]

/** Catalogs `catalog_phrases` matches against, by name. See `catalogsFromRegion`. */
export type IdentityCatalogs = Record<string, RegionFiscalEntry[]>

export type ExtractOptions = {
  /** Catalogs for `catalog_phrases`. Pass `catalogsFromRegion(region.fiscal_id)`. */
  catalogs?: IdentityCatalogs
  /** The URL the QR of the document encodes (`decodePdfQr`). */
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
   * What was read, by field (`multiple` fields are arrays). NEVER contains a `discard_fields` field.
   * Conventional names: `tax_id`, `legal_name`, `postal_code`, `tax_regime`, `document_id`, `issued_on`.
   */
  fields: Record<string, ExtractedValue>
  /** Where each field came from: the document text or its QR. */
  sources: Record<string, 'text' | 'qr'>
  /** Required fields that were not found. Show them empty for the buyer to fill in. */
  missing: string[]
  /** Names (never values) of the fields the spec discards: the store does not keep them, and the UI can say so. */
  discarded: string[]
  /**
   * `match`: every field present in both the text and the QR agrees (`null`: nothing to compare). `canonical`: the
   * rules' `qr_canonical` URL rebuilt from what the QR carried, even if the reader garbled it; `''` when none.
   */
  qr: { match: boolean | null; canonical: string }
  /** `issued_on` is older than `freshness_days`. `null` when it cannot be told. */
  stale: boolean | null
  age_days: number | null
}

/** Plugin extractor of a country whose document cannot be described with rules. Synchronous and pure. */
export type IdentityExtractorFn = (
  text: string,
  spec: IdentityDocumentSpec,
  options: ExtractOptions,
) => { fields: Record<string, ExtractedValue>; sources?: Record<string, 'text' | 'qr'>; qr_match?: boolean | null; missing?: string[] }

export type EvidenceInput = {
  /** SHA-256 of the file (`PdfTextResult.sha256`). */
  sha256?: string | null
  source: FiscalDocumentSource
}

export type { FiscalDocumentEvidence }
