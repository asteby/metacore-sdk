// Pure-logic coverage for the relation/option cell resolution path used by
// `defaultGetDynamicColumns`. The renderers themselves are JSX (covered in the
// host's render tests); here we lock the value-resolution contract that drives
// them so a backend shape change is caught without a DOM.
import { describe, it, expect } from 'vitest'
import { relationKeyFor, resolveRelationImage, resolveRelationLabel } from '../dynamic-columns'
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

    it('treats an unresolved nil UUID FK as empty, not a string of zeros', () => {
        const row = { category_id: '00000000-0000-0000-0000-000000000000' }
        expect(resolveRelationLabel(col({ ref: 'categories' }), row)).toBe('')
    })

    it('still prefers a resolved sibling label even if the FK id is the nil UUID', () => {
        const row = {
            category_id: '00000000-0000-0000-0000-000000000000',
            category: { value: '00000000-0000-0000-0000-000000000000', label: 'Sin categoría' },
        }
        expect(resolveRelationLabel(col({ ref: 'categories' }), row)).toBe('Sin categoría')
    })
})

describe('resolveRelationImage', () => {
    const brandCol = (over: Partial<ColumnDefinition> = {}): ColumnDefinition =>
        col({ key: 'brand_id', label: 'Marca', ref: 'brands', ...over })

    it('reads the thumbnail the backend stamps on the resolved sibling', () => {
        const row = {
            brand_id: 'uuid-1',
            brand: { value: 'uuid-1', label: 'Michelin', image: 'https://cdn/x/m.png' },
        }
        expect(resolveRelationImage(brandCol(), row)).toBe('https://cdn/x/m.png')
    })

    it('also accepts avatar/photo aliases on the sibling', () => {
        expect(
            resolveRelationImage(brandCol(), {
                brand: { value: 'u', label: 'X', avatar: 'a.png' },
            }),
        ).toBe('a.png')
        expect(
            resolveRelationImage(brandCol(), {
                brand: { value: 'u', label: 'X', photo: 'p.png' },
            }),
        ).toBe('p.png')
    })

    it('returns empty string when the sibling carries no image (text-only chip)', () => {
        const row = { brand_id: 'uuid-2', brand: { value: 'uuid-2', label: 'Genérica' } }
        expect(resolveRelationImage(brandCol(), row)).toBe('')
    })

    it('returns empty string when there is no sibling at all', () => {
        expect(resolveRelationImage(brandCol(), { brand_id: 'uuid-3' })).toBe('')
        expect(resolveRelationImage(brandCol(), {})).toBe('')
    })

    it('ignores an empty-string image (no broken thumbnail)', () => {
        const row = { brand: { value: 'u', label: 'X', image: '' } }
        expect(resolveRelationImage(brandCol(), row)).toBe('')
    })
})
