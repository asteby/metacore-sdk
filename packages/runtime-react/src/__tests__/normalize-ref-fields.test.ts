import { describe, it, expect } from 'vitest'
import { normalizeRefFieldsForSubmit } from '../dialogs/normalize-submit'

const NIL = '00000000-0000-0000-0000-000000000000'

// A minimal field-metadata shape — only the keys the normalizer reads.
const fields: any[] = [
    { key: 'category_id', ref: 'categories' }, // reference (getFieldRef)
    { key: 'brand_id', type: 'dynamic_select' }, // reference by type
    { key: 'owner_id', type: 'search' }, // reference by type
    { key: 'name', type: 'text' }, // plain scalar
    { key: 'description', type: 'textarea' },
]

describe('normalizeRefFieldsForSubmit', () => {
    it('nulls an empty-string reference so a nullable FK accepts it (no 23503)', () => {
        const out = normalizeRefFieldsForSubmit(
            { category_id: '', name: 'Test' },
            fields,
        )
        expect(out.category_id).toBeNull()
    })

    it('nulls a nil-UUID reference value', () => {
        const out = normalizeRefFieldsForSubmit({ brand_id: NIL }, fields)
        expect(out.brand_id).toBeNull()
    })

    it('nulls a nil-UUID on ANY field, reference or not', () => {
        const out = normalizeRefFieldsForSubmit({ some_id: NIL }, fields)
        expect(out.some_id).toBeNull()
    })

    it('leaves a populated reference untouched', () => {
        const id = '11111111-1111-1111-1111-111111111111'
        const out = normalizeRefFieldsForSubmit({ category_id: id }, fields)
        expect(out.category_id).toBe(id)
    })

    it('does NOT null an empty plain text field (empty string is legitimate)', () => {
        const out = normalizeRefFieldsForSubmit(
            { name: '', description: '' },
            fields,
        )
        expect(out.name).toBe('')
        expect(out.description).toBe('')
    })

    it('nulls empty search / dynamic_select references', () => {
        const out = normalizeRefFieldsForSubmit(
            { brand_id: '', owner_id: '' },
            fields,
        )
        expect(out.brand_id).toBeNull()
        expect(out.owner_id).toBeNull()
    })

    it('does not mutate the input object', () => {
        const input = { category_id: '' }
        normalizeRefFieldsForSubmit(input, fields)
        expect(input.category_id).toBe('')
    })
})
