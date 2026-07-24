// @vitest-environment happy-dom
//
// `lineSubtable` scopes the audit/system-column hiding to the view-modal
// line-subtable context. On a standalone detail page (default, lineSubtable
// omitted) the relation panel keeps the previous behaviour and still renders
// audit columns (created_at, created_by, …). Inside the view modal the host
// passes `lineSubtable` and those redundant columns are dropped.
//
// Guards against the regression CodeRabbit flagged on SDK #659: the audit
// filter was applied unconditionally to every DynamicRelation, hiding those
// columns on full detail pages too.
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
        { key: 'created_at', label: 'Creado', type: 'datetime', sortable: true, filterable: false },
    ],
    actions: [],
    hasActions: false,
    enableCRUDActions: false,
}

const DATA = [{ id: 'li_1', invoice_id: 'inv_42', sku: 'A-1', created_at: '2026-01-01T00:00:00Z' }]

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

describe('DynamicRelation — lineSubtable context', () => {
    it('página de detalle (default): conserva la columna de auditoría created_at', async () => {
        renderPanel({})
        await waitFor(() => expect(screen.getByText('A-1')).toBeTruthy())
        expect(screen.getByText('Creado')).toBeTruthy()
    })

    it('sub-tabla del modal de vista (lineSubtable): oculta created_at', async () => {
        renderPanel({ lineSubtable: true })
        await waitFor(() => expect(screen.getByText('A-1')).toBeTruthy())
        expect(screen.queryByText('Creado')).toBeNull()
    })
})
