// @vitest-environment happy-dom
//
// DynamicTable `extraBulkActions` / `hideBulkDelete`:
//   1. Host actions render in the floating bar once rows are selected and
//      receive the selected rows / ids.
//   2. `clearSelection()` empties the selection.
//   3. Changing page drops the selection (classic pagination) so a bulk
//      action can never target rows that are no longer visible.
//   4. `hideBulkDelete` removes the built-in "Eliminar".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => () => {},
}))
const I18N = {
    t: (_k: string, o?: { defaultValue?: string; count?: number; total?: number }) => {
        if (o?.defaultValue && o.count != null && o.total != null) {
            return o.defaultValue.replace('{{count}}', String(o.count)).replace('{{total}}', String(o.total))
        }
        return o?.defaultValue ?? _k
    },
    i18n: { language: 'es' },
}
vi.mock('react-i18next', () => ({ useTranslation: () => I18N }))

import { DynamicTable } from '../dynamic-table'
import { makeDefaultGetDynamicColumns } from '../dynamic-columns'
import { ApiProvider, type ApiClient } from '../api-context'
import { useMetadataCache } from '../metadata-cache'
import type { TableMetadata } from '../types'

afterEach(cleanup)

const getDynamicColumns = makeDefaultGetDynamicColumns()

function meta(): TableMetadata {
    return {
        title: 'Issues',
        endpoint: '/data/issue',
        columns: [
            { key: 'title', label: 'Title', type: 'text', sortable: true, filterable: false, searchable: true },
        ],
        actions: [],
        perPageOptions: [10, 20, 50],
        defaultPerPage: 10,
        searchPlaceholder: 'Buscar...',
        enableCRUDActions: false,
        hasActions: false,
    }
}

function fakeApi(total: number): ApiClient {
    const ok = (data: unknown) => ({ data: { success: true, data, meta: { total } } })
    return {
        get: vi.fn(async (url: string, cfg?: any) => {
            if (url.startsWith('/metadata/table/')) return ok(meta())
            if (url.endsWith('/facets')) return ok([])
            const p = cfg?.params?.page ?? 1
            const size = cfg?.params?.per_page ?? 10
            const rows: Array<{ id: number; title: string }> = []
            for (let i = (p - 1) * size; i < Math.min(p * size, total); i++) rows.push({ id: i + 1, title: `Issue ${i + 1}` })
            return ok(rows)
        }),
        post: vi.fn(async () => ok(null)),
        put: vi.fn(async () => ok(null)),
        delete: vi.fn(async () => ok(null)),
    }
}

async function selectFirstRow() {
    await screen.findAllByText('Issue 1')
    const boxes = screen.getAllByRole('checkbox')
    fireEvent.click(boxes[1]) // [0] is the select-all header checkbox
}

describe('DynamicTable extraBulkActions', () => {
    beforeEach(() => {
        localStorage.clear()
        sessionStorage.clear()
        useMetadataCache.getState().setMetadata('issue', meta())
    })

    it('renders host actions with the selection and lets them clear it', async () => {
        const seen: unknown[] = []
        render(
            <ApiProvider client={fakeApi(5)}>
                <DynamicTable
                    model="issue"
                    enableUrlSync={false} getDynamicColumns={getDynamicColumns}
                    extraBulkActions={({ selectedRows, selectedIds, clearSelection }) => (
                        <button onClick={() => { seen.push({ rows: selectedRows.length, ids: selectedIds }); clearSelection() }}>
                            Aprobar seleccionados
                        </button>
                    )}
                />
            </ApiProvider>,
        )
        expect(screen.queryByText('Aprobar seleccionados')).toBeNull()
        await selectFirstRow()
        fireEvent.click(await screen.findByText('Aprobar seleccionados'))
        expect(seen).toEqual([{ rows: 1, ids: [1] }])
        await waitFor(() => expect(screen.queryByText('Aprobar seleccionados')).toBeNull())
    })

    it('accepts a plain node and keeps the built-in delete by default', async () => {
        render(
            <ApiProvider client={fakeApi(5)}>
                <DynamicTable model="issue" enableUrlSync={false} getDynamicColumns={getDynamicColumns} extraBulkActions={<button>Extra</button>} />
            </ApiProvider>,
        )
        await selectFirstRow()
        expect(await screen.findByText('Extra')).toBeTruthy()
        expect(screen.getByText('Eliminar')).toBeTruthy()
    })

    it('hideBulkDelete removes the built-in delete', async () => {
        render(
            <ApiProvider client={fakeApi(5)}>
                <DynamicTable model="issue" enableUrlSync={false} getDynamicColumns={getDynamicColumns} hideBulkDelete extraBulkActions={<button>Extra</button>} />
            </ApiProvider>,
        )
        await selectFirstRow()
        expect(await screen.findByText('Extra')).toBeTruthy()
        expect(screen.queryByText('Eliminar')).toBeNull()
    })

    it('drops the selection when the page changes', async () => {
        render(
            <ApiProvider client={fakeApi(25)}>
                <DynamicTable model="issue" enableUrlSync={false} getDynamicColumns={getDynamicColumns} extraBulkActions={<button>Extra</button>} />
            </ApiProvider>,
        )
        await selectFirstRow()
        expect(await screen.findByText('Extra')).toBeTruthy()
        fireEvent.click(await screen.findByRole('button', { name: /siguiente|next/i }))
        await screen.findAllByText('Issue 11')
        await waitFor(() => expect(screen.queryByText('Extra')).toBeNull())
    })
})
