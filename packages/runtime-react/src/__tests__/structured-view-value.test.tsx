// @vitest-environment happy-dom
//
// Detail-view wiring: the read-only "Información detallada del registro" dialog
// renders jsonb line-items through `ViewValue` → `StructuredViewValue` →
// `CollectionCell variant="inline"`. This locks in the regression fix: the
// detail view no longer dumps raw `JSON.stringify`, and an `item_fields` schema
// drives localized headers + resolved ref labels (the injected `{value,label}`
// sibling) — "Producto | Cantidad / Test | 10".
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// Identity translator + a Spanish locale, matching the host dialog.
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'es' } }),
}))

import { ViewValue } from '../dialogs/dynamic-record'

afterEach(cleanup)

describe('detail-view jsonb line-items (ViewValue → inline CollectionCell)', () => {
    const itemFields = [
        { key: 'product_id', label: 'Producto', ref: 'Product' },
        { key: 'quantity', label: 'Cantidad' },
    ]

    it('renders the schema mini-table with resolved ref labels, not raw JSON', () => {
        const { container } = render(
            <ViewValue
                field={{ key: 'items', label: 'Items', type: 'json', itemFields }}
                value={[
                    {
                        product_id: '550e8400-e29b-41d4-a716-446655440000',
                        product: { value: 'x', label: 'Test' },
                        quantity: 10,
                    },
                ]}
                record={{}}
            />
        )
        // Localized headers from the schema (verbatim) + resolved ref value.
        expect(screen.getByRole('columnheader', { name: 'Producto' })).toBeTruthy()
        expect(screen.getByRole('columnheader', { name: 'Cantidad' })).toBeTruthy()
        expect(screen.getByRole('cell', { name: 'Test' })).toBeTruthy()
        expect(screen.getByRole('cell', { name: '10' })).toBeTruthy()
        // No raw JSON dump, no leaked uuid.
        expect(container.querySelector('pre')).toBeNull()
        expect(container.textContent).not.toContain('550e8400-e29b')
    })

    it('tolerates the snake_case item_fields alias', () => {
        render(
            <ViewValue
                field={{ key: 'items', label: 'Items', type: 'json', item_fields: itemFields }}
                value={[
                    { product_id: 'a', product: { value: 'a', label: 'Aceite' }, quantity: 3 },
                ]}
                record={{}}
            />
        )
        expect(screen.getByRole('cell', { name: 'Aceite' })).toBeTruthy()
    })

    it('falls back to a generic localized mini-table when no schema (no raw JSON)', () => {
        const { container } = render(
            <ViewValue
                field={{ key: 'items', label: 'Items', type: 'json' }}
                value={[{ product_id: 'abc', quantity: 2 }]}
                record={{}}
            />
        )
        // product_id → "Producto" via the built-in es dictionary; no <pre>.
        expect(screen.getByRole('columnheader', { name: 'Producto' })).toBeTruthy()
        expect(container.querySelector('pre')).toBeNull()
    })

    it('renders a plain jsonb object as a localized pair list (not [object Object])', () => {
        const { container } = render(
            <ViewValue
                field={{ key: 'fiscal_data', label: 'Fiscal', type: 'json' }}
                value={{ price: 10, quantity: 20 }}
                record={{}}
            />
        )
        expect(screen.getByText('Precio:')).toBeTruthy()
        expect(container.textContent).not.toContain('[object Object]')
    })

    it('keeps the "—" empty marker for an empty array', () => {
        const { container } = render(
            <ViewValue
                field={{ key: 'items', label: 'Items', type: 'json' }}
                value={[]}
                record={{}}
            />
        )
        expect(container.textContent).toContain('—')
    })
})
