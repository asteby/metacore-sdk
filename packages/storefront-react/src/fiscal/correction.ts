/**
 * What a refused invoice gives the form to correct it. When the tax authority refuses an invoice because of a datum the buyer
 * typed, the order's `invoice` summary (`stage: 'needs_data'`) carries the reason in plain words (`reason_message`), the field
 * (`reason_field`), the data that was sent (`submitted`) and the attempts left today (`retries_left`). This turns that into
 * what `FiscalIdentityFields` takes: prefilled `values` and an `errors` entry on the refused control.
 *
 * Pure and serializable: no React, so a loader can compute it and a test can read it.
 */
import type { InvoiceSummary } from '@asteby/storefront'
import type { FieldErrors } from '../checkout/fields.js'
import type { FiscalFieldName, FiscalFieldValues } from './types.js'

export type InvoiceCorrection = {
  /** The form is shown again to correct and retry: the summary says `needs_data` and attempts remain. */
  canCorrect: boolean
  /** The reason in plain words from the server, or null when it did not say (an older server). */
  message: string | null
  /** The refused control's name in the form (`invoice.legal_name`), or null. */
  controlName: string | null
  /** The refused field, as a `FiscalFieldName`. */
  field: FiscalFieldName | null
  /** What the buyer sent, for `FiscalIdentityFields values`. Empty when the server did not return it. */
  values: Partial<FiscalFieldValues>
  /** `{ [controlName]: text }` for `FiscalIdentityFields errors`, only when the field is known. */
  errors: FieldErrors
  /** Attempts left today, or null when unknown. */
  retriesLeft: number | null
}

const FIELD_OF: Record<string, FiscalFieldName> = {
  tax_id: 'tax_id',
  legal_name: 'legal_name',
  tax_regime: 'tax_regime',
  postal_code: 'postal_code',
  invoice_use: 'use',
  use: 'use',
}

/**
 * @param fieldRefused the text put on the refused control (default: the server's reason when it has one).
 * @param prefix       the form controls' prefix (default `invoice`).
 */
export function invoiceCorrection(invoice: InvoiceSummary | null | undefined, options: { fieldRefused?: string; prefix?: string } = {}): InvoiceCorrection {
  const prefix = options.prefix ?? 'invoice'
  const retriesLeft = typeof invoice?.retries_left === 'number' ? invoice.retries_left : null
  const field = invoice?.reason_field ? (FIELD_OF[invoice.reason_field] ?? null) : null
  const message = invoice?.reason_message?.trim() || null
  const values: Partial<FiscalFieldValues> = {}
  const sent = invoice?.submitted
  if (sent) {
    if (sent.tax_id) values.tax_id = sent.tax_id
    if (sent.legal_name) values.legal_name = sent.legal_name
    if (sent.postal_code) values.postal_code = sent.postal_code
    if (sent.tax_regime) values.tax_regime = sent.tax_regime
    if (sent.invoice_use) values.use = sent.invoice_use
  }
  const controlName = field ? `${prefix}.${field}` : null
  const errors: FieldErrors = controlName ? { [controlName]: options.fieldRefused ?? message ?? 'invalid' } : {}
  const canCorrect = invoice?.stage === 'needs_data' && invoice.can_request !== false && (retriesLeft === null || retriesLeft > 0)
  return { canCorrect, message, controlName, field, values, errors, retriesLeft }
}
