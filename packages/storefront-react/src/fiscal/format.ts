/**
 * Pure helpers over the region's fiscal catalog (`Region.fiscal_id`). They know no country: the tax id format, the
 * regimes, the invoice uses and the postal code format are all data.
 */
import type { InvoiceRequest, Region, RegionFiscalEntry, RegionFiscalId } from '@asteby/storefront'
import type { FiscalFieldName, FiscalFieldValues } from './types.js'

export type FiscalRegion = Pick<Region, 'address'> & { fiscal_id?: RegionFiscalId }

/** Uppercase, no spaces, hyphens or dots: how a tax id is compared and sent. */
export function normalizeTaxId(raw: string): string {
  return raw.replace(/[\s\-.]/g, '').toUpperCase()
}

/** Masks a tax id for display and logs: first 2 and last 3 characters stay (`PE********ABC`). */
export function maskTaxId(taxId: string): string {
  const v = taxId.trim()
  return v.length <= 5 ? '*'.repeat(v.length) : `${v.slice(0, 2)}${'*'.repeat(v.length - 5)}${v.slice(-3)}`
}

const compile = (pattern: string | undefined): RegExp | null => {
  if (!pattern) return null
  try {
    return new RegExp(pattern)
  } catch {
    return null
  }
}

/** `null` when the tax id is valid for the region (its pattern or one of its generic ids); otherwise why not. */
export function taxIdProblem(fid: RegionFiscalId | undefined, raw: string): 'required' | 'format' | null {
  const v = normalizeTaxId(raw)
  if (!v) return 'required'
  if (!fid) return null
  if (fid.generic_ids.includes(v)) return null
  const re = compile(fid.pattern)
  return re && !re.test(v) ? 'format' : null
}

export function postalCodeProblem(region: FiscalRegion, raw: string): 'required' | 'format' | null {
  const v = raw.trim()
  if (!v) return 'required'
  const re = compile(region.address?.postal_code?.pattern)
  return re && !re.test(v) ? 'format' : null
}

/**
 * Builds the function that tells a person type from a tax id when the region does not publish one. Pass the length
 * of the tax id per type, e.g. `personTypeByLength({ individual: 13, company: 12 })`. Without a function the regimes
 * are not narrowed by person type (the server still checks the combination).
 */
export function personTypeByLength(lengths: Record<string, number>): (taxId: string) => string | null {
  return (taxId) => {
    const n = normalizeTaxId(taxId).length
    return Object.keys(lengths).find((t) => lengths[t] === n) ?? null
  }
}

/**
 * Tells a person type from a tax id with the region's own patterns (`fiscal_id.person_patterns`, DATA of the region
 * pack). `null` when the region publishes none or none matches. A pattern that does not compile is ignored.
 */
export function personTypeFromPatterns(fid: RegionFiscalId | undefined, taxId: string): string | null {
  const patterns = fid?.person_patterns
  if (!patterns) return null
  const v = normalizeTaxId(taxId)
  for (const type of Object.keys(patterns).sort()) {
    const re = compile(patterns[type])
    if (re?.test(v)) return type
  }
  return null
}

/** The function to use for the person type: the store's override, else the region's patterns. */
export function personTypeResolver(fid: RegionFiscalId | undefined, override?: (taxId: string) => string | null): (taxId: string) => string | null {
  return override ?? ((taxId) => personTypeFromPatterns(fid, taxId))
}

/**
 * The invoice use to suggest for a regime, from region data only: the organization's `default_invoice_use` when the
 * regime admits it, else the first use whose `suggested_for_regimes` lists the regime (and whose `allowed_regimes`
 * admits it). `null` when the region suggests nothing: then nothing is preselected. A suggestion, never a rule.
 */
export function suggestInvoiceUse(fid: RegionFiscalId | undefined, regime: string | null | undefined): string | null {
  if (!fid || !regime) return null
  const allowed = usesFor(fid, regime)
  const preferred = fid.default_invoice_use
  if (preferred && allowed.some((u) => u.code === preferred)) return preferred
  return allowed.find((u) => u.suggested_for_regimes?.includes(regime))?.code ?? null
}

/** Regimes that fit a person type (all when the type is unknown). */
export function regimesFor(fid: RegionFiscalId | undefined, personType: string | null): RegionFiscalEntry[] {
  const all = fid?.regimes ?? []
  if (!personType) return all
  return all.filter((r) => r.person_types.length === 0 || r.person_types.includes(personType))
}

/** Invoice uses a regime admits (all when no regime is chosen yet). */
export function usesFor(fid: RegionFiscalId | undefined, regime: string | null | undefined): RegionFiscalEntry[] {
  const all = fid?.invoice_uses ?? []
  if (!regime) return all
  return all.filter((u) => !u.allowed_regimes || u.allowed_regimes.length === 0 || u.allowed_regimes.includes(regime))
}

export type FiscalProblem = 'required' | 'format' | 'unknown' | 'person_type' | 'use_not_allowed'

/** Client-side check of the whole form against the region; the server stays the authority. */
export function validateFiscalValues(
  region: FiscalRegion,
  v: Partial<FiscalFieldValues>,
  personTypeOverride?: (taxId: string) => string | null,
): Partial<Record<FiscalFieldName, FiscalProblem>> {
  const fid = region.fiscal_id
  const personTypeOf = personTypeResolver(fid, personTypeOverride)
  const out: Partial<Record<FiscalFieldName, FiscalProblem>> = {}
  const tax = taxIdProblem(fid, v.tax_id ?? '')
  if (tax) out.tax_id = tax
  if (!(v.legal_name ?? '').trim()) out.legal_name = 'required'
  if (postalCodeProblem(region, v.postal_code ?? '')) out.postal_code = postalCodeProblem(region, v.postal_code ?? '')!
  const regime = v.tax_regime ?? ''
  if (!regime) out.tax_regime = 'required'
  else if (fid) {
    const entry = fid.regimes.find((r) => r.code === regime)
    if (!entry) out.tax_regime = 'unknown'
    else if (!tax && !fid.generic_ids.includes(normalizeTaxId(v.tax_id ?? ''))) {
      const person = personTypeOf?.(v.tax_id ?? '') ?? null
      if (person && entry.person_types.length > 0 && !entry.person_types.includes(person)) out.tax_regime = 'person_type'
    }
  }
  const use = v.use ?? ''
  if (!use) out.use = 'required'
  else if (fid) {
    const entry = fid.invoice_uses.find((u) => u.code === use)
    if (!entry) out.use = 'unknown'
    else if (regime && entry.allowed_regimes && entry.allowed_regimes.length > 0 && !entry.allowed_regimes.includes(regime)) out.use = 'use_not_allowed'
  }
  return out
}

/** Form values -> the API's `InvoiceRequest` (without `document`). */
export function toInvoiceRequest(v: Partial<FiscalFieldValues>, countryCode?: string): InvoiceRequest {
  return {
    requested: true,
    tax_id: normalizeTaxId(v.tax_id ?? ''),
    legal_name: (v.legal_name ?? '').trim(),
    tax_regime: v.tax_regime ?? '',
    use: v.use ?? '',
    postal_code: (v.postal_code ?? '').trim(),
    ...(countryCode ? { country_code: countryCode } : {}),
  }
}

/** `label_en` for English locales when the region has it. */
export function entryLabel(e: RegionFiscalEntry, locale?: string | null): string {
  return (locale ?? 'es-MX').toLowerCase().startsWith('en') && e.label_en ? e.label_en : e.label
}
