// Pure-logic coverage for the relation/option cell resolution path used by
// `defaultGetDynamicColumns`. The renderers themselves are JSX (covered in the
// host's render tests); here we lock the value-resolution contract that drives
// them so a backend shape change is caught without a DOM.
import { describe, it, expect } from 'vitest'
import { relationKeyFor, resolveRelationLabel } from '../dynamic-columns'
import type { ColumnDefinition } from '../types'

const col = (over: Partial<ColumnDefinition>): ColumnDefinition => ({
    key: 'category_id',
    label: 'Categoría',
    type: 'text',
    sortable: true,
    filterable: true,
    ...over,
})

describe('relationKeyFor', () => {
    it('strips the trailing _id (FK key → relation sibling key)', () => {
        expect(relationKeyFor({ key: 'category_id' })).toBe('category')
        expect(relationKeyFor({ key: 'supplier_id' })).toBe('supplier')
    })

    it('leaves keys without _id untouched', () => {
        expect(relationKeyFor({ key: 'category' })).toBe('category')
        expect(relationKeyFor({ key: 'parent_uid' })).toBe('parent_uid')
    })
})

describe('resolveRelationLabel', () => {
    it('prefers the backend-resolved sibling label', () => {
        const row = {
            category_id: 'uuid-1',
            category: { value: 'uuid-1', label: 'Llantas' },
        }
        expect(resolveRelationLabel(col({ ref: 'categories' }), row)).toBe('Llantas')
    })

    it('accepts a sibling that uses { name } instead of { label }', () => {
        const row = { category_id: 'uuid-2', category: { value: 'uuid-2', name: 'Frenos' } }
        expect(resolveRelationLabel(col({ ref: 'categories' }), row)).toBe('Frenos')
    })

    it('falls back to the raw id when no sibling was resolved', () => {
        const row = { category_id: 'uuid-3' }
        expect(resolveRelationLabel(col({ ref: 'categories' }), row)).toBe('uuid-3')
    })

    it('returns empty string when there is no value at all', () => {
        expect(resolveRelationLabel(col({ ref: 'categories' }), {})).toBe('')
        expect(resolveRelationLabel(col({ ref: 'categories' }), { category_id: null })).toBe('')
    })
})
