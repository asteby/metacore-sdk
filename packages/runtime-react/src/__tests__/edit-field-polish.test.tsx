// @vitest-environment happy-dom
//
// Record EDIT dialog polish (mode='edit'), affecting every module that uses the
// generic dialog (transfers, orders, customers):
//   PART 1 — a jsonb line-items field renders READ-ONLY as the inline table
//            (the detail-view renderer), never an input that stringifies to
//            "[object Object]".
//   PART 2 — a FK select seeds its trigger from the backend-injected relation
//            sibling (`source_warehouse_id` → `source_warehouse: {value,label}`)
//            so an existing selection shows the related record's NAME, not the
//            raw uuid.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// Identity translator (so `defaultValue` surfaces) + Spanish locale.
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string, o?: any) => o?.defaultValue ?? k,
        i18n: { language: 'es' },
    }),
}))

import { EditField, isLineItemsField, fkSeedOption } from '../dialogs/dynamic-record'
import { ApiProvider, type ApiClient } from '../api-context'

afterEach(cleanup)

const noopApi = { get: vi.fn(async () => ({ data: { data: [] } })) } as unknown as ApiClient

describe('isLineItemsField', () => {
    it('matches a field with a declared item_fields schema', () => {
        expect(
            isLineItemsField(
                { key: 'items', label: 'Items', type: 'json', itemFields: [{ key: 'q', label: 'Q' }] },
                null,
            ),
        ).toBe(true)
        // snake_case alias
        expect(
            isLineItemsField(
                { key: 'items', label: 'Items', type: 'json', item_fields: [{ key: 'q', label: 'Q' }] },
                null,
            ),
        ).toBe(true)
    })

    it('matches any array / plain-object value (would stringify to [object Object])', () => {
        expect(isLineItemsField({ key: 'items', label: 'Items', type: 'json' }, [{ a: 1 }])).toBe(true)
        expect(isLineItemsField({ key: 'data', label: 'Data', type: 'json' }, { a: 1 })).toBe(true)
    })

    it('does NOT match scalars or dedicated editable widgets', () => {
        expect(isLineItemsField({ key: 'name', label: 'Name', type: 'text' }, 'hi')).toBe(false)
        expect(isLineItemsField({ key: 'n', label: 'N', type: 'number' }, 5)).toBe(false)
        expect(isLineItemsField({ key: 'photo', label: 'Photo', type: 'image' }, { url: 'x' })).toBe(false)
        expect(isLineItemsField({ key: 'f', label: 'F', type: 'text', widget: 'upload' }, {})).toBe(false)
        expect(isLineItemsField({ key: 'when', label: 'When', type: 'date' }, new Date())).toBe(false)
    })
})

describe('fkSeedOption', () => {
    const field = { key: 'source_warehouse_id', label: 'Origen', type: 'text', ref: 'warehouses' }

    it('builds a seed option from the injected {value,label} sibling', () => {
        const seed = fkSeedOption(field, 'wh-1', {
            source_warehouse_id: 'wh-1',
            source_warehouse: { value: 'wh-1', label: 'Test2', image: 'logo.png' },
        })
        expect(seed).toEqual({ id: 'wh-1', value: 'wh-1', label: 'Test2', name: 'Test2', image: 'logo.png' })
    })

    it('returns null when there is no usable sibling', () => {
        expect(fkSeedOption(field, 'wh-1', { source_warehouse_id: 'wh-1' })).toBeNull()
        expect(fkSeedOption(field, '', {})).toBeNull()
        expect(fkSeedOption(field, null, { source_warehouse: { label: 'x' } })).toBeNull()
    })
})

describe('EditField — PART 1: jsonb line-items read-only', () => {
    it('renders the inline table (read-only), not an input or [object Object]', () => {
        const onChange = vi.fn()
        const { container } = render(
            <ApiProvider client={noopApi}>
                <EditField
                    field={{
                        key: 'items',
                        label: 'Items',
                        type: 'json',
                        itemFields: [
                            { key: 'product_id', label: 'Producto', ref: 'Product' },
                            { key: 'quantity', label: 'Cantidad' },
                        ],
                    }}
                    value={[
                        {
                            product_id: '550e8400-e29b-41d4-a716-446655440000',
                            product: { value: 'x', label: 'Test' },
                            quantity: 10,
                        },
                    ]}
                    onChange={onChange}
                    record={{}}
                />
            </ApiProvider>,
        )
        // Localized headers + resolved ref label from the inline CollectionCell.
        expect(screen.getByRole('columnheader', { name: 'Producto' })).toBeTruthy()
        expect(screen.getByRole('cell', { name: 'Test' })).toBeTruthy()
        expect(screen.getByRole('cell', { name: '10' })).toBeTruthy()
        // No editable input, no [object Object], no leaked uuid, read-only hint.
        expect(container.querySelector('input')).toBeNull()
        expect(container.querySelector('textarea')).toBeNull()
        expect(container.textContent).not.toContain('[object Object]')
        expect(container.textContent).not.toContain('550e8400-e29b')
        expect(screen.getByText('Solo lectura')).toBeTruthy()
    })

    it('renders a bare jsonb object read-only (no schema) instead of [object Object]', () => {
        const { container } = render(
            <ApiProvider client={noopApi}>
                <EditField
                    field={{ key: 'fiscal_data', label: 'Fiscal', type: 'json' }}
                    value={{ price: 10, quantity: 20 }}
                    onChange={vi.fn()}
                    record={{}}
                />
            </ApiProvider>,
        )
        expect(container.querySelector('input')).toBeNull()
        expect(container.textContent).not.toContain('[object Object]')
        expect(screen.getByText('Precio:')).toBeTruthy()
    })
})

describe('EditField — PART 2: FK select shows the resolved label', () => {
    it('seeds the trigger with the sibling label, not the raw uuid', () => {
        render(
            <ApiProvider client={noopApi}>
                <EditField
                    field={{ key: 'source_warehouse_id', label: 'Origen', type: 'text', ref: 'warehouses' }}
                    value={'550e8400-e29b-41d4-a716-446655440000'}
                    onChange={vi.fn()}
                    record={{
                        source_warehouse_id: '550e8400-e29b-41d4-a716-446655440000',
                        source_warehouse: { value: '550e8400-e29b-41d4-a716-446655440000', label: 'Test2' },
                    }}
                />
            </ApiProvider>,
        )
        // The combobox trigger shows the resolved label.
        expect(screen.getByText('Test2')).toBeTruthy()
        // The raw uuid is not shown.
        expect(screen.queryByText('550e8400-e29b-41d4-a716-446655440000')).toBeNull()
    })

    it('keeps the raw value as fallback when no sibling was injected', () => {
        render(
            <ApiProvider client={noopApi}>
                <EditField
                    field={{ key: 'source_warehouse_id', label: 'Origen', type: 'text', ref: 'warehouses' }}
                    value={'wh-xyz'}
                    onChange={vi.fn()}
                    record={{ source_warehouse_id: 'wh-xyz' }}
                />
            </ApiProvider>,
        )
        // No sibling → existing behaviour: the raw value is shown on the trigger.
        expect(screen.getByText('wh-xyz')).toBeTruthy()
    })
})
