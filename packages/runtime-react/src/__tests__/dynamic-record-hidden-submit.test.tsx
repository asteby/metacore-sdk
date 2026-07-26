// DynamicRecordDialog payload contract: a field hidden by its `visible_when`
// predicate must NOT be POSTed. A DiscountRule with rule_scope=category shows
// only category_id; the product_id / customer_id it isn't showing must be
// stripped from the create payload. `stripHiddenFieldValues` is the pure helper
// the dialog runs just before `normalizeRefFieldsForSubmit`, mirroring
// dynamic-form.tsx, which builds its Zod schema only over the visible fields.
import { describe, expect, it } from 'vitest'
import { stripHiddenFieldValues } from '../dialogs/dynamic-record'

// Modal fields for a DiscountRule: a `rule_scope` discriminator gates the
// product / customer / category reference fields via visible_when.
const fields = [
    { key: 'name', label: 'Nombre', type: 'text', required: true },
    { key: 'rule_scope', label: 'Alcance', type: 'text', required: true },
    {
        key: 'product_id',
        label: 'Producto',
        type: 'text',
        visible_when: { field: 'rule_scope', equals: 'product' },
    },
    {
        key: 'customer_id',
        label: 'Cliente',
        type: 'text',
        visible_when: { field: 'rule_scope', equals: 'customer' },
    },
    {
        key: 'category_id',
        label: 'Categoría',
        type: 'text',
        visible_when: { field: 'rule_scope', equals: 'category' },
    },
] as any

describe('stripHiddenFieldValues (visible_when submit parity)', () => {
    it('excludes fields hidden by visible_when from the create payload', () => {
        // Scope=category → only category_id visible; product_id / customer_id are
        // hidden and must be dropped even though they carry a value.
        const out = stripHiddenFieldValues(
            {
                name: 'Promo',
                rule_scope: 'category',
                category_id: 'cat-1',
                product_id: 'prod-1',
                customer_id: 'cust-1',
            },
            fields,
            'create',
        )

        expect(out.category_id).toBe('cat-1')
        expect(out.rule_scope).toBe('category')
        expect(out.name).toBe('Promo')
        expect('product_id' in out).toBe(false)
        expect('customer_id' in out).toBe(false)
    })

    it('keeps the matching branch field for a different scope', () => {
        const out = stripHiddenFieldValues(
            { rule_scope: 'product', product_id: 'prod-1', category_id: 'cat-1' },
            fields,
            'create',
        )
        expect(out.product_id).toBe('prod-1')
        expect('category_id' in out).toBe(false)
    })

    it('never drops fields that declare no visible_when', () => {
        const out = stripHiddenFieldValues(
            { name: '', rule_scope: '', extra: 'x' },
            fields,
            'create',
        )
        // name has no visible_when → kept; extra has no declared field → kept.
        expect('name' in out).toBe(true)
        expect(out.extra).toBe('x')
    })
})
