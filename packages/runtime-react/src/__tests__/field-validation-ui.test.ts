import { describe, expect, it } from 'vitest'
import {
    clearFieldErrorTree,
    formatFieldErrorsDescription,
    labelForValidationPath,
    lineItemErrorsFor,
} from '../field-validation-ui'
import type { ActionFieldDef } from '../types'

const fields: ActionFieldDef[] = [
    { key: 'customer_id', label: 'Cliente', type: 'dynamic_select', required: true },
    {
        key: 'lines',
        label: 'Renglones',
        type: 'array',
        required: true,
        itemFields: [
            { key: 'product_id', label: 'Producto', type: 'dynamic_select', required: true },
            { key: 'unit_price', label: 'Precio unitario', type: 'number', required: true },
        ],
    },
]

describe('field-validation-ui', () => {
    it('labels dotted line-item paths with fila N', () => {
        expect(labelForValidationPath('lines.0.unit_price', fields)).toBe(
            'Renglones → Precio unitario (fila 1)',
        )
    })

    it('formats toast description with field labels', () => {
        const desc = formatFieldErrorsDescription(
            { 'lines.0.unit_price': 'es obligatorio' },
            fields,
        )
        expect(desc).toContain('Precio unitario (fila 1)')
        expect(desc).toContain('es obligatorio')
    })

    it('slices parent errors for DynamicLineItems', () => {
        expect(
            lineItemErrorsFor('lines', {
                'lines.0.unit_price': 'required',
                customer_id: 'required',
            }),
        ).toEqual({ '0.unit_price': 'required' })
    })

    it('clears dotted children when parent key edits', () => {
        expect(
            clearFieldErrorTree(
                { 'lines.0.unit_price': 'x', customer_id: 'y' },
                'lines',
            ),
        ).toEqual({ customer_id: 'y' })
    })
})
