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

    // --- Fase 4: explicit `nullable` flag from the kernel contract ---

    it('nulls an empty ref when the explicit nullable:true flag is present', () => {
        const out = normalizeRefFieldsForSubmit(
            { supplier_id: '' },
            [{ key: 'supplier_id', ref: 'suppliers', nullable: true }],
        )
        expect(out.supplier_id).toBeNull()
    })

    it('respects an empty value when nullable:false (does not null)', () => {
        const out = normalizeRefFieldsForSubmit(
            { supplier_id: '' },
            [{ key: 'supplier_id', ref: 'suppliers', nullable: false }],
        )
        expect(out.supplier_id).toBe('')
    })

    it('nulls an empty NON-uuid optional ref via explicit nullable:true', () => {
        // A ref over a non-uuid column: the uuid-only heuristic never covered
        // this, but the explicit flag + ref-shape does.
        const out = normalizeRefFieldsForSubmit(
            { warehouse_code: '' },
            [{ key: 'warehouse_code', type: 'dynamic_select', nullable: true }],
        )
        expect(out.warehouse_code).toBeNull()
    })

    it('does NOT null a nullable:true plain-text field (empty string stays)', () => {
        const out = normalizeRefFieldsForSubmit(
            { note: '' },
            [{ key: 'note', type: 'text', nullable: true }],
        )
        expect(out.note).toBe('')
    })

    it('falls back to the heuristic when the flag is undefined (older host)', () => {
        const out = normalizeRefFieldsForSubmit(
            { category_id: '', name: '' },
            fields, // fields carry no `nullable` flag
        )
        expect(out.category_id).toBeNull() // ref → heuristic nulls it
        expect(out.name).toBe('') // plain text stays
    })
})
