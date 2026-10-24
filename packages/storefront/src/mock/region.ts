/**
 * Region fixture of the mock: Mexico exactly as `GET /storefront/region` publishes it (see `region-mx.seed.ts`),
 * identity document `MX:csf` included, so a storefront can be built and tested without a server. It lives here,
 * and only here: the real data belongs to the region package, and the engine in `fiscal-document` knows no country.
 */
import type { IdentityDocumentSpec, IdentityRulesV1, InvoiceRequest, Region, RegionFiscalId } from '../types.js'
import { SEED_MX_CSF, SEED_MX_FISCAL_ID_PATTERN, SEED_MX_GENERIC_IDS, SEED_MX_INVOICE_USES, SEED_MX_PAYMENT_METHODS, SEED_MX_REGIMES } from './region-mx.seed.js'

export const MOCK_IDENTITY_DOCUMENT_MX_CSF: IdentityDocumentSpec = SEED_MX_CSF
export const MOCK_CSF_RULES = SEED_MX_CSF.rules as IdentityRulesV1

export const MOCK_FISCAL_ID_MX: RegionFiscalId = {
  kind: 'mx_rfc',
  label: 'RFC',
  pattern: SEED_MX_FISCAL_ID_PATTERN,
  generic_ids: SEED_MX_GENERIC_IDS,
  regimes: SEED_MX_REGIMES,
  invoice_uses: SEED_MX_INVOICE_USES,
  documents: [SEED_MX_CSF],
}

export const MOCK_REGION_MX: Region = {
  country_code: 'MX',
  name: 'México',
  locale: { default: 'es-MX', available: ['es-MX', 'en-US'], current: 'es-MX' },
  timezone: 'America/Mexico_City',
  currency: { code: 'MXN', symbol: '$', symbol_position: 'before', minor_units: 2 },
  formats: { date: 'dd/MM/yyyy', measurement: 'metric' },
  tax: { prices_include_tax: true, label: 'IVA', price_label: 'IVA incluido', show_breakdown: true, default_category: 'standard', categories: ['standard'] },
  address: { postal_code: { pattern: '^[0-9]{5}$', example: '06600' } },
  fiscal_id: MOCK_FISCAL_ID_MX,
  payment_methods: SEED_MX_PAYMENT_METHODS,
}

export type InvoiceFieldError = { field: string; message: string }

/** `individual` for a 13-character tax id, `company` for 12 (the mock's rule; a real region decides this server-side). */
export function mockPersonType(taxId: string): string | null {
  if (taxId.length === 13) return 'individual'
  if (taxId.length === 12) return 'company'
  return null
}

/** The first thing wrong with an invoice request against a region, as the API reports it (`field: invoice.<field>`), or `null`. */
export function validateInvoiceRequest(region: Region | null, input: InvoiceRequest, prefix = 'invoice'): InvoiceFieldError | null {
  const text = (...v: unknown[]) => v.map((x) => (typeof x === 'string' ? x.trim() : '')).find(Boolean) ?? ''
  const fid = region?.fiscal_id
  const taxId = text(input.tax_id, input.rfc).toUpperCase()
  const name = text(input.legal_name, input.razon_social)
  const regime = text(input.tax_regime, input.regimen)
  const use = text(input.use, input.uso_cfdi, input.invoice_use, input.cfdi_use)
  const postal = text(input.postal_code, input.cp, input.zip)
  const bad = (field: string, message: string): InvoiceFieldError => ({ field: `${prefix}.${field}`, message })

  if (!taxId) return bad('tax_id', 'The tax id is required')
  if (fid?.pattern && !fid.generic_ids.includes(taxId) && !new RegExp(fid.pattern).test(taxId)) return bad('tax_id', `Not a valid ${fid.kind}`)
  if (!name) return bad('legal_name', 'The legal name is required')
  if (!regime) return bad('tax_regime', 'The tax regime is required')
  const entry = fid?.regimes.find((r) => r.code === regime)
  if (fid && !entry) return bad('tax_regime', `Unknown tax regime ${regime}`)
  const person = fid?.generic_ids.includes(taxId) ? null : mockPersonType(taxId)
  if (entry && person && entry.person_types.length > 0 && !entry.person_types.includes(person)) {
    return bad('tax_regime', `The regime ${regime} does not apply to this ${fid!.kind}`)
  }
  const postalPattern = region?.address?.postal_code?.pattern
  if (!postal || (postalPattern && !new RegExp(postalPattern).test(postal))) return bad('postal_code', 'Not a valid postal code')
  if (!use) return bad('use', 'The invoice use is required')
  const useEntry = fid?.invoice_uses.find((u) => u.code === use)
  if (fid && !useEntry) return bad('use', `Unknown invoice use ${use}`)
  if (useEntry?.allowed_regimes && useEntry.allowed_regimes.length > 0 && !useEntry.allowed_regimes.includes(regime)) {
    return bad('use', `The regime ${regime} does not admit the use ${use}`)
  }
  return null
}

export function maskTaxId(taxId: string): string {
  const v = taxId.trim()
  return v.length <= 4 ? '*'.repeat(v.length) : `${v.slice(0, 2)}${'*'.repeat(v.length - 5)}${v.slice(-3)}`
}
