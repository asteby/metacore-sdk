import { describe, it, expect } from 'vitest'
import {
    evaluateVisibleWhen,
    evaluateVisibleWhenForListScope,
    buildListScopeValues,
    scopeValueFromFilterToken,
    getVisibleWhen,
} from '../dynamic-form-schema'
import type { VisibleWhen } from '../types'

// The discount_rules use case: a `rule_scope` field decides which picker shows.
const equalsProduct: VisibleWhen = { field: 'rule_scope', equals: 'product' }
const inCategory: VisibleWhen = { field: 'rule_scope', in: ['category'] }
const inMulti: VisibleWhen = { field: 'scope', in: ['a', 'b'] }
const customerOnly: VisibleWhen = { field: 'party_type', equals: 'customer' }
const supplierOnly: VisibleWhen = { field: 'party_type', equals: 'supplier' }

describe('evaluateVisibleWhen', () => {
    it('no predicate → always visible', () => {
        expect(evaluateVisibleWhen(undefined, { rule_scope: 'all' })).toBe(true)
        expect(evaluateVisibleWhen(null, {})).toBe(true)
    })

    it('empty field → always visible (no-op)', () => {
        expect(evaluateVisibleWhen({ field: '' } as VisibleWhen, { rule_scope: 'x' })).toBe(true)
    })

    it('`equals` matches the sibling value exactly', () => {
        expect(evaluateVisibleWhen(equalsProduct, { rule_scope: 'product' })).toBe(true)
        expect(evaluateVisibleWhen(equalsProduct, { rule_scope: 'category' })).toBe(false)
        expect(evaluateVisibleWhen(equalsProduct, { rule_scope: 'all' })).toBe(false)
    })

    it('`in` matches membership; wins over `equals` when both present', () => {
        expect(evaluateVisibleWhen(inCategory, { rule_scope: 'category' })).toBe(true)
        expect(evaluateVisibleWhen(inCategory, { rule_scope: 'product' })).toBe(false)
        expect(evaluateVisibleWhen(inMulti, { scope: 'b' })).toBe(true)
        const both: VisibleWhen = { field: 'rule_scope', equals: 'product', in: ['category'] }
        // `in` wins: category matches, product does not.
        expect(evaluateVisibleWhen(both, { rule_scope: 'category' })).toBe(true)
        expect(evaluateVisibleWhen(both, { rule_scope: 'product' })).toBe(false)
    })

    it('missing / null sibling value compares as empty string', () => {
        expect(evaluateVisibleWhen(equalsProduct, {})).toBe(false)
        expect(evaluateVisibleWhen(equalsProduct, { rule_scope: null })).toBe(false)
        expect(evaluateVisibleWhen({ field: 'x', equals: '' } as VisibleWhen, {})).toBe(true)
    })

    it('coerces non-string sibling values before comparison', () => {
        expect(evaluateVisibleWhen({ field: 'n', equals: '5' } as VisibleWhen, { n: 5 })).toBe(true)
        expect(evaluateVisibleWhen({ field: 'b', in: ['true'] } as VisibleWhen, { b: true })).toBe(true)
    })

    it('predicate naming a field but no comparison → visible', () => {
        expect(evaluateVisibleWhen({ field: 'rule_scope' } as VisibleWhen, { rule_scope: 'all' })).toBe(true)
    })
})

describe('getVisibleWhen', () => {
    it('reads snake_case and camelCase aliases', () => {
        expect(getVisibleWhen({ visible_when: equalsProduct })).toEqual(equalsProduct)
        expect(getVisibleWhen({ visibleWhen: inCategory })).toEqual(inCategory)
    })

    it('returns undefined for none / malformed', () => {
        expect(getVisibleWhen(undefined)).toBeUndefined()
        expect(getVisibleWhen({})).toBeUndefined()
        expect(getVisibleWhen({ visible_when: { equals: 'x' } as unknown as VisibleWhen })).toBeUndefined()
    })
})

describe('scopeValueFromFilterToken / buildListScopeValues', () => {
    it('strips eq: and leaves bare values', () => {
        expect(scopeValueFromFilterToken('eq:customer')).toBe('customer')
        expect(scopeValueFromFilterToken('customer')).toBe('customer')
        expect(scopeValueFromFilterToken('IN:a,b')).toBe('IN:a,b')
    })

    it('merges defaultFilters over dynamic and skips multi-value chips', () => {
        expect(
            buildListScopeValues(
                { party_type: 'eq:customer', branch_id: 'eq:b1' },
                { party_type: ['supplier'], status: ['open', 'draft'], warehouse: ['w1'] },
            ),
        ).toEqual({ party_type: 'customer', branch_id: 'b1', warehouse: 'w1' })
    })
})

describe('evaluateVisibleWhenForListScope', () => {
    it('keeps columns when the governing field is unknown (mixed list)', () => {
        expect(evaluateVisibleWhenForListScope(customerOnly, {})).toBe(true)
        expect(evaluateVisibleWhenForListScope(supplierOnly, {})).toBe(true)
        expect(evaluateVisibleWhenForListScope(customerOnly, { other: 'x' })).toBe(true)
    })

    it('hides the opposite party column when nav locks party_type', () => {
        expect(evaluateVisibleWhenForListScope(customerOnly, { party_type: 'customer' })).toBe(true)
        expect(evaluateVisibleWhenForListScope(supplierOnly, { party_type: 'customer' })).toBe(false)
        expect(evaluateVisibleWhenForListScope(customerOnly, { party_type: 'supplier' })).toBe(false)
        expect(evaluateVisibleWhenForListScope(supplierOnly, { party_type: 'supplier' })).toBe(true)
    })
})
