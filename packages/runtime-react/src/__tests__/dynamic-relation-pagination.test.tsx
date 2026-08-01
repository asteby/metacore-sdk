// @vitest-environment happy-dom
//
// An embedded child list pages server-side. It used to fetch EVERY row of the
// relation in one request, so a parent with thousands of children froze the
// dialog. Now the first request carries page/per_page, the panel shows a
// "cargadas / total" counter while more remain, and a search box appears once
// the list outgrows a page.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { DynamicRelation, DEFAULT_RELATION_PAGE_SIZE } from '../dynamic-relation'
import { ApiProvider, type ApiClient } from '../api-context'

afterEach(cleanup)

const META = {
    name: 'line_item',
    columns: [
        { key: 'id', label: 'ID', type: 'text', sortable: true, filterable: false, hidden: true },
        { key: 'invoice_id', label: 'Factura', type: 'text', sortable: false, filterable: false },
        { key: 'sku', label: 'SKU', type: 'text', sortable: true, filterable: true, searchable: true },
    ],
    actions: [],
    hasActions: false,
    enableCRUDActions: false,
}

/** A page of `n` rows starting at `from`. */
function page(from: number, n: number) {
    return Array.from({ length: n }, (_, i) => ({
        id: `li_${from + i}`,
        invoice_id: 'inv_42',
        sku: `SKU-${from + i}`,
    }))
}

function mockApi(total: number): { client: ApiClient; get: ReturnType<typeof vi.fn> } {
    const get = vi.fn((url: string, config?: any) => {
        if (url.startsWith('/metadata/table/')) {
            return Promise.resolve({ data: { success: true, data: META } })
        }
        const per = Number(config?.params?.per_page ?? DEFAULT_RELATION_PAGE_SIZE)
        const p = Number(config?.params?.page ?? 1)
        const start = (p - 1) * per
        const rows = page(start, Math.max(0, Math.min(per, total - start)))
        return Promise.resolve({ data: { success: true, data: rows, meta: { total } } })
    })
    return {
        client: {
            get,
            post: vi.fn(() => Promise.resolve({ data: { success: true, data: {} } })),
            put: vi.fn(() => Promise.resolve({ data: { success: true, data: {} } })),
            delete: vi.fn(() => Promise.resolve({ data: { success: true, data: {} } })),
        } as unknown as ApiClient,
        get,
    }
}

function renderPanel(total: number, extra: Record<string, unknown> = {}) {
    const api = mockApi(total)
    render(
        <ApiProvider client={api.client}>
            <DynamicRelation
                kind="one_to_many"
                model="line_item"
                foreignKey="invoice_id"
                parentId="inv_42"
                {...extra}
            />
        </ApiProvider>,
    )
    return api
}

describe('DynamicRelation one_to_many — paginación', () => {
    it('pide la primera página con page/per_page en vez de traer todo', async () => {
        const api = renderPanel(500)
        await waitFor(() => expect(screen.getByText('SKU-0')).toBeTruthy())

        const dataCall = api.get.mock.calls.find(
            (c: any[]) => typeof c[0] === 'string' && c[0].startsWith('/data/'),
        )
        expect(dataCall).toBeTruthy()
        expect(dataCall?.[1]?.params?.page).toBe('1')
        expect(dataCall?.[1]?.params?.per_page).toBe(String(DEFAULT_RELATION_PAGE_SIZE))
        // El scope del padre sigue viajando.
        expect(dataCall?.[1]?.params?.f_invoice_id).toBe('eq:inv_42')

        // Sólo se pintó una página, no las 500 filas.
        expect(screen.queryByText(`SKU-${DEFAULT_RELATION_PAGE_SIZE}`)).toBeNull()
    })

    it('muestra el contador cargadas/total mientras quedan filas', async () => {
        renderPanel(500)
        await waitFor(() =>
            expect(screen.getByText(`${DEFAULT_RELATION_PAGE_SIZE} / 500`)).toBeTruthy(),
        )
    })

    it('respeta un perPage explícito', async () => {
        const api = renderPanel(500, { perPage: 5 })
        await waitFor(() => expect(screen.getByText('SKU-0')).toBeTruthy())
        const dataCall = api.get.mock.calls.find(
            (c: any[]) => typeof c[0] === 'string' && c[0].startsWith('/data/'),
        )
        expect(dataCall?.[1]?.params?.per_page).toBe('5')
        expect(screen.queryByText('SKU-5')).toBeNull()
    })

    it('una lista corta no muestra buscador ni contador', async () => {
        renderPanel(3)
        await waitFor(() => expect(screen.getByText('SKU-0')).toBeTruthy())
        expect(screen.queryByPlaceholderText('Buscar en la lista…')).toBeNull()
        expect(screen.queryByText('3 / 3')).toBeNull()
    })

    it('una lista larga ofrece el buscador', async () => {
        renderPanel(500)
        await waitFor(() =>
            expect(screen.getByPlaceholderText('Buscar en la lista…')).toBeTruthy(),
        )
    })
})
