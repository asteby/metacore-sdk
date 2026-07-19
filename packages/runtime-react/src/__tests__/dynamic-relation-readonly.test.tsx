// @vitest-environment happy-dom
//
// `readonly` on a relation fixes the panel read-only: the SDK forces
// canCreate/canEdit/canDelete = false regardless of the perms the host passes,
// hiding the "Agregar" (Plus) button and the per-row edit (Pencil) / delete
// (Trash2) controls. Generic framework primitive — the flag rides on the
// kernel relation metadata (RelationMeta.readonly, camelCase alias readOnly).
//
// The one_to_many list renders plain metadata-driven cells (no Radix Select),
// so the happy-dom BubbleSelect value-reset gotcha does not apply here.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { DynamicRelation } from '../dynamic-relation'
import { ApiProvider, type ApiClient } from '../api-context'

afterEach(cleanup)

const META = {
    name: 'line_item',
    columns: [
        { key: 'id', label: 'ID', type: 'text', sortable: true, filterable: false, hidden: true },
        { key: 'invoice_id', label: 'Factura', type: 'text', sortable: false, filterable: false },
        { key: 'sku', label: 'SKU', type: 'text', sortable: true, filterable: true },
        { key: 'qty', label: 'Cantidad', type: 'number', sortable: true, filterable: false },
    ],
    actions: [],
    hasActions: false,
    enableCRUDActions: false,
}

const DATA = [
    { id: 'li_1', invoice_id: 'inv_42', sku: 'A-1', qty: 2 },
    { id: 'li_2', invoice_id: 'inv_42', sku: 'B-2', qty: 5 },
]

function mockApi(): ApiClient {
    return {
        get: vi.fn((url: string) => {
            if (url.startsWith('/metadata/table/')) {
                return Promise.resolve({ data: { success: true, data: META } })
            }
            return Promise.resolve({ data: { success: true, data: DATA } })
        }),
        post: vi.fn(() => Promise.resolve({ data: { success: true, data: {} } })),
        put: vi.fn(() => Promise.resolve({ data: { success: true, data: {} } })),
        delete: vi.fn(() => Promise.resolve({ data: { success: true, data: {} } })),
    }
}

function renderPanel(extra: Record<string, unknown>) {
    return render(
        <ApiProvider client={mockApi()}>
            <DynamicRelation
                kind="one_to_many"
                model="line_item"
                foreignKey="invoice_id"
                parentId="inv_42"
                {...extra}
            />
        </ApiProvider>,
    )
}

describe('DynamicRelation — readonly', () => {
    it('con readonly=true esconde "Agregar", Pencil y Trash2 aunque el host pase canCreate/canEdit/canDelete=true', async () => {
        renderPanel({ readonly: true, canCreate: true, canEdit: true, canDelete: true })

        // Rows loaded → cells rendered.
        await waitFor(() => expect(screen.getByText('A-1')).toBeTruthy())

        // No add control, no per-row edit/delete controls.
        expect(screen.queryByText('Agregar')).toBeNull()
        expect(screen.queryByLabelText('Editar')).toBeNull()
        expect(screen.queryByLabelText('Quitar')).toBeNull()
    })

    it('acepta el alias camelCase readOnly', async () => {
        renderPanel({ readOnly: true })
        await waitFor(() => expect(screen.getByText('A-1')).toBeTruthy())
        expect(screen.queryByText('Agregar')).toBeNull()
        expect(screen.queryByLabelText('Editar')).toBeNull()
        expect(screen.queryByLabelText('Quitar')).toBeNull()
    })

    it('control: sin readonly muestra "Agregar", Pencil y Trash2', async () => {
        renderPanel({})
        await waitFor(() => expect(screen.getByText('A-1')).toBeTruthy())
        expect(screen.getByText('Agregar')).toBeTruthy()
        expect(screen.getAllByLabelText('Editar')).toHaveLength(2)
        expect(screen.getAllByLabelText('Quitar')).toHaveLength(2)
    })
})
