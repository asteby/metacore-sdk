import { describe, expect, it } from 'vitest'
import { MOCK_REGION_MX } from '@asteby/storefront/mock'
import { maskTaxId, normalizeTaxId, personTypeByLength, personTypeFromPatterns, personTypeResolver, postalCodeProblem, regimesFor, suggestInvoiceUse, taxIdProblem, toInvoiceRequest, usesFor, validateFiscalValues } from './format.js'

const fid = MOCK_REGION_MX.fiscal_id!
const person = personTypeByLength({ individual: 13, company: 12 })

describe('fiscal helpers over the region', () => {
  it('normalizes and masks a tax id', () => {
    expect(normalizeTaxId(' pepj-8001 01.ab3 ')).toBe('PEPJ800101AB3')
    expect(maskTaxId('PEPJ800101AB3')).toBe('PE********AB3')
    expect(maskTaxId('AB')).toBe('**')
  })
  it('checks the tax id against the pattern or the generic ids', () => {
    expect(taxIdProblem(fid, '')).toBe('required')
    expect(taxIdProblem(fid, 'nope')).toBe('format')
    expect(taxIdProblem(fid, 'abc010203ab1')).toBeNull()
    expect(taxIdProblem(fid, fid.generic_ids[0]!)).toBeNull()
    expect(taxIdProblem(undefined, 'anything')).toBeNull()
  })
  it('checks the postal code against the region', () => {
    expect(postalCodeProblem(MOCK_REGION_MX, '06600')).toBeNull()
    expect(postalCodeProblem(MOCK_REGION_MX, '6600')).toBe('format')
    expect(postalCodeProblem({}, '12345')).toBeNull()
  })
  it('narrows regimes by person type only when it can be told', () => {
    expect(regimesFor(fid, null)).toHaveLength(fid.regimes.length)
    const ind = regimesFor(fid, 'individual').map((r) => r.code)
    const co = regimesFor(fid, 'company').map((r) => r.code)
    expect(ind).toContain('612')
    expect(ind).not.toContain('601')
    expect(co).toContain('601')
    expect(person('ABC010203AB1')).toBe('company')
    expect(person('PEPJ800101AB3')).toBe('individual')
    expect(person('SHORT')).toBeNull()
  })
  it('narrows uses by regime', () => {
    expect(usesFor(fid, '')).toHaveLength(fid.invoice_uses.length)
    for (const u of usesFor(fid, '605')) expect(!u.allowed_regimes?.length || u.allowed_regimes.includes('605')).toBe(true)
    expect(usesFor(fid, '605').length).toBeLessThan(fid.invoice_uses.length)
  })
  it('validates the whole form like the server does', () => {
    expect(validateFiscalValues(MOCK_REGION_MX, {}, person)).toEqual({ tax_id: 'required', legal_name: 'required', postal_code: 'required', tax_regime: 'required', use: 'required' })
    const ok = { tax_id: 'ABC010203AB1', legal_name: 'X SA', postal_code: '44100', tax_regime: '601', use: 'G03' }
    expect(validateFiscalValues(MOCK_REGION_MX, ok, person)).toEqual({})
    expect(validateFiscalValues(MOCK_REGION_MX, { ...ok, tax_regime: '612' }, person).tax_regime).toBe('person_type')
    expect(validateFiscalValues(MOCK_REGION_MX, { ...ok, tax_regime: '999' }, person).tax_regime).toBe('unknown')
    const notAllowed = fid.invoice_uses.find((u) => u.allowed_regimes?.length && !u.allowed_regimes.includes('601'))
    if (notAllowed) expect(validateFiscalValues(MOCK_REGION_MX, { ...ok, use: notAllowed.code }, person).use).toBe('use_not_allowed')
  })
  it('builds the API request', () => {
    expect(toInvoiceRequest({ tax_id: ' abc010203ab1', legal_name: ' X ', postal_code: '44100', tax_regime: '601', use: 'G03' }, 'MX')).toEqual({
      requested: true, tax_id: 'ABC010203AB1', legal_name: 'X', tax_regime: '601', use: 'G03', postal_code: '44100', country_code: 'MX',
    })
  })
})

describe('person type and suggested use come from region DATA', () => {
  it('tells the person type with the region patterns, and an override wins', () => {
    expect(personTypeFromPatterns(fid, 'PEPJ800101AB3')).toBe('individual')
    expect(personTypeFromPatterns(fid, 'ABC010203AB1')).toBe('company')
    expect(personTypeFromPatterns(fid, 'nope')).toBeNull()
    expect(personTypeFromPatterns({ ...fid, person_patterns: undefined }, 'PEPJ800101AB3')).toBeNull()
    expect(personTypeFromPatterns({ ...fid, person_patterns: { x: '(' } }, 'PEPJ800101AB3')).toBeNull()
    expect(personTypeResolver(fid)('PEPJ800101AB3')).toBe('individual')
    expect(personTypeResolver(fid, () => 'custom')('PEPJ800101AB3')).toBe('custom')
  })

  it('validation narrows by the pattern-derived person type without any injected function', () => {
    const bad = validateFiscalValues(MOCK_REGION_MX, { tax_id: 'PEPJ800101AB3', legal_name: 'X', postal_code: '06600', tax_regime: '601', use: 'G03' })
    expect(bad.tax_regime).toBe('person_type')
    const ok = validateFiscalValues(MOCK_REGION_MX, { tax_id: 'PEPJ800101AB3', legal_name: 'X', postal_code: '06600', tax_regime: '612', use: 'G03' })
    expect(ok).toEqual({})
  })

  it('suggests a use only from the data, only when the regime admits it, and the org default wins', () => {
    expect(suggestInvoiceUse(fid, '612')).toBe('G03')
    expect(suggestInvoiceUse(fid, '605')).toBe('S01')
    expect(suggestInvoiceUse(fid, null)).toBeNull()
    expect(suggestInvoiceUse(undefined, '612')).toBeNull()
    expect(suggestInvoiceUse({ ...fid, invoice_uses: fid.invoice_uses.map(({ suggested_for_regimes: _s, ...u }) => u) }, '612')).toBeNull()
    expect(suggestInvoiceUse({ ...fid, default_invoice_use: 'S01' }, '612')).toBe('S01')
    // A default the regime does not admit is ignored (D01 is for individuals under 605/606/612...; 601 is a company).
    expect(suggestInvoiceUse({ ...fid, default_invoice_use: 'D01' }, '601')).toBe('G03')
    // A suggestion the matrix does not admit is never offered.
    const rigged = { ...fid, invoice_uses: fid.invoice_uses.map((u) => (u.code === 'CN01' ? { ...u, suggested_for_regimes: ['612'] } : u)) }
    expect(suggestInvoiceUse(rigged, '612')).toBe('G03')
  })
})
