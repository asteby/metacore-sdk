import { describe, it, expect } from 'vitest'
import { parseRuleString, checkValue, validateValues, bagHasErrors, exemptUnchangedRuleIssues } from '../validator'
import type { ActionFieldDef } from '../types'

describe('parseRuleString', () => {
    it('parses Laravel pipes', () => {
        const s = parseRuleString('required|min:2|max:10|email')
        expect(s.required).toBe(true)
        expect(s.min).toBe(2)
        expect(s.max).toBe(10)
        expect(s.custom).toBe('email')
    })
    it('parses go-playground commas', () => {
        const s = parseRuleString('required,min=2,max=100')
        expect(s.required).toBe(true)
        expect(s.min).toBe(2)
        expect(s.max).toBe(100)
    })
    it('treats a slug as custom', () => {
        expect(parseRuleString('$org.tax_id_validator').custom).toBe('$org.tax_id_validator')
    })
})

describe('checkValue', () => {
    it('required on empty', () => {
        expect(checkValue('', { required: true })).toEqual([{ code: 'required' }])
        expect(checkValue('x', { required: true })).toEqual([])
    })
    it('min/max length on strings', () => {
        expect(checkValue('ab', { type: 'string', min: 3 })).toEqual([
            { code: 'min', params: { min: 3, kind: 'length' } },
        ])
    })
    it('regex + email', () => {
        expect(checkValue('nope', { type: 'string', regex: '^[A-Z]+$' })[0]?.code).toBe('regex')
        expect(checkValue('a@b.com', { custom: 'email' })).toEqual([])
        expect(checkValue('not-an-email', { custom: 'email' })[0]?.code).toBe('email')
    })
    it('skips other rules when empty and not required', () => {
        expect(checkValue('', { type: 'string', min: 3, custom: 'email' })).toEqual([])
    })
})

describe('validateValues', () => {
    const fields: ActionFieldDef[] = [
        { key: 'name', label: 'Nombre', type: 'text', required: true },
        { key: 'sku', label: 'SKU', type: 'text', validation: { min: 3, regex: '^[A-Z]+$' } },
        {
            key: 'items',
            label: 'Renglones',
            type: 'array',
            required: true,
            itemFields: [{ key: 'qty', label: 'Cantidad', type: 'number', required: true }],
        },
    ]
    it('collects every field including dotted line-items', () => {
        const bag = validateValues(fields, { sku: 'ab', items: [{ qty: '' }] })
        expect(bag.name?.[0]?.code).toBe('required')
        expect(bag.sku?.map(i => i.code).sort()).toEqual(['min', 'regex'])
        expect(bag['items.0.qty']?.[0]?.code).toBe('required')
        expect(bagHasErrors(bag)).toBe(true)
    })
    it('parses a laravel string on validation', () => {
        const bag = validateValues(
            [{ key: 'email', label: 'Email', type: 'text', validation: 'required|email' }],
            { email: 'nope' },
        )
        expect(bag.email?.[0]?.code).toBe('email')
    })
})

describe('exemptUnchangedRuleIssues (QA LIVE-19)', () => {
    const fields: ActionFieldDef[] = [
        { key: 'name', label: 'Nombre', type: 'text', required: true } as ActionFieldDef,
        { key: 'tax_id', label: 'RFC', type: 'text', validation: { regex: '^[A-Z]{3,4}[0-9]{6}[A-Z0-9]{3}$' } } as ActionFieldDef,
        { key: 'price', label: 'Precio', type: 'number', validation: { min: 0 } } as ActionFieldDef,
    ]
    it('keeps an untouched legacy value from blocking the edit', () => {
        const values = { name: 'Renombrado', tax_id: 'abc-010101', price: '-5' }
        const bag = validateValues(fields, values)
        expect(bagHasErrors(bag)).toBe(true)
        const out = exemptUnchangedRuleIssues(bag, values, { name: 'Viejo', tax_id: 'abc-010101', price: -5 })
        expect(bagHasErrors(out)).toBe(false)
    })
    it('still reports a changed invalid value and required', () => {
        const values = { name: '', tax_id: 'xyz', price: -6 }
        const out = exemptUnchangedRuleIssues(validateValues(fields, values), values, { name: 'Viejo', tax_id: 'abc-010101', price: -5 })
        expect(out.tax_id?.[0]?.code).toBe('regex')
        expect(out.price?.[0]?.code).toBe('min')
        expect(out.name?.[0]?.code).toBe('required')
    })
    it('is a no-op without a persisted record (create)', () => {
        const values = { name: 'x', tax_id: 'abc' }
        const bag = validateValues(fields, values)
        expect(exemptUnchangedRuleIssues(bag, values, null)).toEqual(bag)
    })
})
