// Locks the org-currency fallback contract for money rendering: the table cell
// (`resolveCurrency`) and the record dialog (`isMoneyField`). Pure logic, no DOM.
import { describe, it, expect } from 'vitest'
import { resolveCurrency } from '../dynamic-columns'
import { isMoneyField } from '../dialogs/dynamic-record'
import type { ColumnDefinition } from '../types'
import type { FieldDef } from '../dialogs/dynamic-record'

const col = (over: Partial<ColumnDefinition>): ColumnDefinition => ({
    key: 'total',
    label: 'Total',
    type: 'number',
    sortable: true,
    filterable: true,
    ...over,
})

const field = (over: Partial<FieldDef>): FieldDef => ({
    key: 'total',
    label: 'Total',
    type: 'number',
    ...over,
})

describe('resolveCurrency', () => {
    it("defaults to 'USD' when neither the column nor the org provide one", () => {
        expect(resolveCurrency(col({}))).toBe('USD')
    })

    it('falls back to the org currency when the column has no explicit currency', () => {
        expect(resolveCurrency(col({}), 'MXN')).toBe('MXN')
    })

    it('prefers the explicit per-column currency over the org fallback', () => {
        expect(resolveCurrency(col({ styleConfig: { currency: 'EUR' } }), 'MXN')).toBe('EUR')
    })
})

describe('isMoneyField', () => {
    it("recognizes the backend cellStyle:'currency' stamp regardless of key", () => {
        expect(isMoneyField(field({ key: 'foo', cellStyle: 'currency' }), 100)).toBe(true)
    })

    it('detects numeric money keys via the heuristic (no stamp needed)', () => {
        expect(isMoneyField(field({ key: 'total' }), 100)).toBe(true)
        expect(isMoneyField(field({ key: 'sub_total' }), 100)).toBe(true)
        expect(isMoneyField(field({ key: 'tax_amount' }), 16)).toBe(true)
        expect(isMoneyField(field({ key: 'unit_price' }), 5)).toBe(true)
        expect(isMoneyField(field({ key: 'balance' }), 0)).toBe(true)
    })

    it('accepts numeric strings the backend serializes', () => {
        expect(isMoneyField(field({ key: 'total' }), '100')).toBe(true)
    })

    it('ignores non-money keys and non-numeric values', () => {
        expect(isMoneyField(field({ key: 'name' }), 'Acme')).toBe(false)
        expect(isMoneyField(field({ key: 'quantity' }), 3)).toBe(false)
        expect(isMoneyField(field({ key: 'total' }), 'n/a')).toBe(false)
        expect(isMoneyField(field({ key: 'total' }), null)).toBe(false)
    })
})
