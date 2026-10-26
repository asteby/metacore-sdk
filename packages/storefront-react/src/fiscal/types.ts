/** What the fiscal components and the server action share. Plain types: no React, no server code. */
import type { FiscalDocumentEvidence, InvoiceRequest, InvoiceResult, InvoiceSummary } from '@asteby/storefront'

/** The fiscal data the buyer confirms. Field names follow the Storefront API (`InvoiceRequest`). */
export type FiscalFieldValues = {
  tax_id: string
  legal_name: string
  postal_code: string
  tax_regime: string
  /** Invoice use. */
  use: string
}

export type FiscalFieldName = keyof FiscalFieldValues

/** What the buyer sees about a document read: values, marks and warnings. Serializable (the server sends it as is). */
export type FiscalExtractionSummary = {
  /** `IdentityDocumentSpec.kind`. */
  kind: string
  values: Partial<FiscalFieldValues>
  /** Regimes the document lists (several: the buyer picks one). Empty: none was detected. */
  regime_candidates: string[]
  /** Fields that came from the document (they are marked and stay editable). */
  from_document: FiscalFieldName[]
  /** The QR agreed with the text: `false` is a warning, `null` there was nothing to compare. */
  qr_match: boolean | null
  stale: boolean | null
  age_days: number | null
  /** Required fields the document did not have. */
  missing: string[]
  evidence: FiscalDocumentEvidence
}

/** Why a document could not be used. `server` is only for the no-JS upload. */
export type FiscalReadError = 'not_pdf' | 'too_large' | 'no_text' | 'password' | 'unreadable'

export type FiscalIntent = 'set-invoice' | 'save-profile' | 'request-invoice' | 'clear-profile' | 'extract-document'

export type FiscalErrorCode =
  /** A field was rejected (`field` says which, like `invoice.tax_regime`). */
  | 'validation'
  /** Saving the profile needs the buyer's OK (`consent`). */
  | 'consent_required'
  /** The buyer is not signed in. */
  | 'unauthorized'
  /** The cart or order does not exist, or it is already an order (`409 already_checked_out`). */
  | 'not_found'
  | 'conflict'
  /** The order cannot be invoiced (yet / any more): see `blocked`. */
  | 'blocked'
  | 'rate_limited'
  /** The store does not invoice. */
  | 'unsupported'
  | 'store_misconfigured'
  | 'unavailable'
  | FiscalReadError

/** What the action returns. Texts are NOT here: the components write them (i18n). */
export type FiscalActionData = {
  ok: boolean
  intent?: FiscalIntent
  /** `review`: a document was read on the server, show it for confirmation. */
  step?: 'review' | 'saved' | 'cleared' | 'requested' | 'issued' | 'pending'
  extraction?: FiscalExtractionSummary
  /** Values to put back in the form after an error (never the document's sensitive fields). */
  values?: Partial<FiscalFieldValues>
  /** Fields the server rejected, by form name (`invoice.tax_regime`) -> machine message. */
  fieldErrors?: Record<string, string>
  error?: { code: FiscalErrorCode; field?: string; blocked?: string }
  invoice?: InvoiceSummary
  result?: InvoiceResult
}

export type { InvoiceRequest }

/**
 * Why invoicing is or is not offered, so a page can say the true thing instead of one generic "not available":
 * - `available`: region with a fiscal catalog and `capabilities.invoicing.available`.
 * - `off`: the server answered and says the store does not invoice (`invoicing.available: false`): no invoicing addon active.
 * - `no_region`: the organization has no region, or its region has no fiscal catalog.
 * - `unknown`: the server answered but does not publish `capabilities.invoicing` (older server, or one that does not
 *   report it): nothing is known about the store, so never claim it does not invoice. The order's own `invoice` summary
 *   (`can_request`, `action`) still says what is possible for that order.
 * - `unreachable`: region or capabilities could not be read (outage, token without scope).
 */
export type FiscalReason = 'available' | 'off' | 'no_region' | 'unknown' | 'unreachable'
