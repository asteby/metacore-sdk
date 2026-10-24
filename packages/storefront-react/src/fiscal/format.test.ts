import { describe, expect, it } from 'vitest'
import { MOCK_REGION_MX } from '@asteby/storefront/mock'
import { maskTaxId, normalizeTaxId, personTypeByLength, postalCodeProblem, regimesFor, taxIdProblem, toInvoiceRequest, usesFor, validateFiscalValues } from './format.js'

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
