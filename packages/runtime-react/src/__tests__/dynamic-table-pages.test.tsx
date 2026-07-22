// @vitest-environment happy-dom
//
// DynamicTable classic pagination ('pages', the default mode):
//   1. The pager footer renders; clicking page 2 issues a NEW query with
//      page=2 and REPLACES the visible rows (no accumulation).
//   2. Changing the filters resets back to page 1.
//   3. The chosen page size persists per table in localStorage and is adopted
//      on the next mount (over the model's server default).
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
import { ApiProvider, type ApiClient } from '../api-context'
import { useMetadataCache } from '../metadata-cache'
import type { TableMetadata } from '../types'

afterEach(cleanup)

function meta(): TableMetadata {
    return {
        title: 'Issues',
        endpoint: '/data/issue',
        group_by: 'stage',
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
    const page = (n: number, size: number) => {
        const start = (n - 1) * size
        const rows: Array<{ id: number; title: string }> = []
        for (let i = start; i < Math.min(start + size, total); i++) {
            rows.push({ id: i + 1, title: `Issue ${i + 1}` })
        }
        return rows
    }
    return {
        get: vi.fn(async (url: string, cfg?: any) => {
            if (url.startsWith('/metadata/table/')) return ok(meta())
            if (url.endsWith('/facets')) return ok([])
            const p = cfg?.params?.page ?? 1
            const size = cfg?.params?.per_page ?? 10
            return ok(page(p, size))
        }),
        post: vi.fn(async () => ok(null)),
        put: vi.fn(async () => ok(null)),
        delete: vi.fn(async () => ok(null)),
    }
}

function dataCalls(api: ApiClient) {
    return (api.get as any).mock.calls.filter((c: any[]) => c[0] === '/data/issue')
}

describe('DynamicTable classic pages mode (default)', () => {
    beforeEach(() => {
        localStorage.clear()
        sessionStorage.clear()
        useMetadataCache.getState().setMetadata('issue', meta())
    })

    it('changes page: new query with page=2 and REPLACES the rows', async () => {
        const api = fakeApi(45)
        render(
            <ApiProvider client={api}>
                <DynamicTable model="issue" pagination="pages" enableUrlSync={false} />
            </ApiProvider>,
        )

        // Page 1 loads with the model's default size.
        await waitFor(() => {
            const first = dataCalls(api)[0]
            expect(first?.[1]?.params).toMatchObject({ page: 1, per_page: 10 })
        })
        await waitFor(() => expect(screen.getAllByText('Issue 1').length).toBeGreaterThan(0))

        // Click the pager's page "2" button.
        const btn2 = screen.getAllByRole('button').find((b) => b.textContent?.trim().endsWith('2'))
        expect(btn2).toBeTruthy()
        fireEvent.click(btn2!)

        await waitFor(() => {
            const pages = dataCalls(api).map((c: any[]) => c[1]?.params?.page)
            expect(pages).toContain(2)
        })
        // Rows were REPLACED, not accumulated: page-2 rows in, page-1 rows out.
        await waitFor(() => expect(screen.getAllByText('Issue 11').length).toBeGreaterThan(0))
        expect(screen.queryByText('Issue 1')).toBeNull()
    })

    it('resets to page 1 when the filters change', async () => {
        const api = fakeApi(45)
        const { rerender } = render(
            <ApiProvider client={api}>
                <DynamicTable model="issue" pagination="pages" enableUrlSync={false} />
            </ApiProvider>,
        )
        await waitFor(() => expect(screen.getAllByText('Issue 1').length).toBeGreaterThan(0))
        const btn2 = screen.getAllByRole('button').find((b) => b.textContent?.trim().endsWith('2'))
        fireEvent.click(btn2!)
        await waitFor(() => expect(screen.getAllByText('Issue 11').length).toBeGreaterThan(0))

        // Change the active filters via defaultFilters (part of buildFilterParams).
        rerender(
            <ApiProvider client={api}>
                <DynamicTable
                    model="issue"
                    pagination="pages"
                    enableUrlSync={false}
                    defaultFilters={{ stage: 'done' }}
                />
            </ApiProvider>,
        )

        // The filtered request goes back to page 1.
        await waitFor(() => {
            const withFilter = dataCalls(api).filter((c: any[]) => c[1]?.params?.f_stage === 'done')
            expect(withFilter.length).toBeGreaterThan(0)
            expect(withFilter.every((c: any[]) => c[1]?.params?.page === 1)).toBe(true)
        })
        await waitFor(() => expect(screen.getAllByText('Issue 1').length).toBeGreaterThan(0))
    })

    it('adopts the per-table page size persisted in localStorage', async () => {
        localStorage.setItem('mc:tbl:pageSize:v1|issue', '20')
        const api = fakeApi(45)
        render(
            <ApiProvider client={api}>
                <DynamicTable model="issue" enableUrlSync={false} />
            </ApiProvider>,
        )
        await waitFor(() => {
            const first = dataCalls(api)[0]
            expect(first?.[1]?.params).toMatchObject({ page: 1, per_page: 20 })
        })
    })
})
