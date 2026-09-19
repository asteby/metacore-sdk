import { describe, expect, it } from 'vitest'
import { applyLineItemRowFormulas } from '../dynamic-form-schema'
import type { ActionFieldDef } from '../types'

const fields: ActionFieldDef[] = [
    { key: 'product_id', label: 'Producto', type: 'dynamic_select' },
    { key: 'qty', label: 'Cantidad', type: 'number' },
    { key: 'unit_price', label: 'Precio', type: 'number' },
    { key: 'discount', label: 'Descuento', type: 'number' },
    { key: 'subtotal', label: 'Importe', type: 'number' },
]

describe('applyLineItemRowFormulas', () => {
    it('computes qty * unit_price - discount into subtotal', () => {
        const row = applyLineItemRowFormulas(fields, {
            product_id: 'p1',
            qty: 3,
            unit_price: 10,
            discount: 5,
            subtotal: 0,
        })
        expect(row.subtotal).toBe(25)
    })

    it('treats blank discount as 0', () => {
        const row = applyLineItemRowFormulas(fields, {
            qty: '2',
            unit_price: '12.5',
            discount: '',
            subtotal: '',
        })
        expect(row.subtotal).toBe(25)
        expect(row.discount).toBe(0)
    })

    it('coerces blank discount to 0 even when subtotal already matches', () => {
        const row = applyLineItemRowFormulas(fields, {
            qty: 1,
            unit_price: 10,
            discount: '',
            subtotal: 10,
        })
        expect(row.subtotal).toBe(10)
        expect(row.discount).toBe(0)
    })

    it('is a no-op without an amount column', () => {
        const lean: ActionFieldDef[] = [
            { key: 'qty', label: 'Cantidad', type: 'number' },
            { key: 'unit_price', label: 'Precio', type: 'number' },
        ]
        const input = { qty: 2, unit_price: 5 }
        expect(applyLineItemRowFormulas(lean, input)).toBe(input)
    })
})
