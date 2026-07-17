// @vitest-environment happy-dom
//
// `lock_rows` on a line-items (type "array") field fixes the row set: the SDK
// hides the "Agregar renglón" button and every per-row delete control, so the
// served rows can only have their cells edited — never added to or removed.
// Generic framework primitive (mirrors kernel v3 `ActionField.lock_rows`).
//
// Cells here are plain text/number inputs on purpose: no Radix Select, so the
// happy-dom BubbleSelect value-reset gotcha does not apply.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DynamicLineItems } from '../dynamic-line-items'
import type { ActionFieldDef } from '../types'

afterEach(cleanup)

const lineField = (overrides: Partial<ActionFieldDef> = {}): ActionFieldDef => ({
    key: 'allocations',
    label: 'Renglones',
    type: 'array',
    itemFields: [
        { key: 'sku', label: 'SKU', type: 'text' },
        { key: 'qty', label: 'Cantidad', type: 'number' },
    ],
    ...overrides,
})

const rows = [
    { sku: 'A-1', qty: 2 },
    { sku: 'B-2', qty: 5 },
]

describe('DynamicLineItems — lock_rows', () => {
    it('con lock_rows=true oculta "Agregar renglón" y los botones de borrar, pero deja editar celdas', () => {
        const onChange = vi.fn()
        render(
            <DynamicLineItems field={lineField({ lock_rows: true })} value={rows} onChange={onChange} />,
        )

        // No add-row control, no per-row delete controls.
        expect(screen.queryByText('Agregar renglón')).toBeNull()
        expect(screen.queryByLabelText('Eliminar renglón')).toBeNull()

        // Cells stay editable: typing into a cell fires onChange with the row updated.
        const skuInputs = screen.getAllByDisplayValue('A-1')
        fireEvent.change(skuInputs[0], { target: { value: 'A-9' } })
        expect(onChange).toHaveBeenCalledWith([
            { sku: 'A-9', qty: 2 },
            { sku: 'B-2', qty: 5 },
        ])
    })

    it('acepta el alias camelCase lockRows', () => {
        render(
            <DynamicLineItems
                field={lineField({ lockRows: true })}
                value={rows}
                onChange={vi.fn()}
            />,
        )
        expect(screen.queryByText('Agregar renglón')).toBeNull()
        expect(screen.queryByLabelText('Eliminar renglón')).toBeNull()
    })

    it('control: sin lock_rows muestra "Agregar renglón" y un botón de borrar por fila', () => {
        render(<DynamicLineItems field={lineField()} value={rows} onChange={vi.fn()} />)
        expect(screen.getByText('Agregar renglón')).toBeTruthy()
        expect(screen.getAllByLabelText('Eliminar renglón')).toHaveLength(2)
    })
})
