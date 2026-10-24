/** Turns what the engine read into what the UI shows. Shared by the browser reader and the server upload. */
import type { FiscalDocumentEvidence } from '@asteby/storefront'
import type { IdentityExtraction } from '@asteby/storefront/fiscal-document'
import { normalizeTaxId } from './format.js'
import type { FiscalExtractionSummary, FiscalFieldName } from './types.js'

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))

/** `evidence` comes from `buildDocumentEvidence`. Only the conventional fields are kept: nothing else can leak. */
export function summarizeExtraction(x: IdentityExtraction, evidence: FiscalDocumentEvidence, validRegimes?: Iterable<string>): FiscalExtractionSummary {
  const f = x.fields
  const valid = validRegimes ? new Set(validRegimes) : null
  const raw = f.tax_regime
  const candidates = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((c) => !valid || valid.has(c))
  const values: FiscalExtractionSummary['values'] = {}
  const from: FiscalFieldName[] = []
  const put = (name: FiscalFieldName, v: string) => {
    if (!v) return
    values[name] = v
    from.push(name)
  }
  put('tax_id', normalizeTaxId(first(f.tax_id)))
  put('legal_name', first(f.legal_name).trim())
  put('postal_code', first(f.postal_code).trim())
  if (candidates.length === 1) put('tax_regime', candidates[0]!)
  else if (candidates.length > 1) from.push('tax_regime')
  return {
    kind: x.kind,
    values,
    regime_candidates: candidates,
    from_document: from,
    qr_match: x.qr.match,
    stale: x.stale,
    age_days: x.age_days,
    missing: [...x.missing],
    evidence,
  }
}
