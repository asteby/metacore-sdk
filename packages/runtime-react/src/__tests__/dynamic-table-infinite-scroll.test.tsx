// @vitest-environment happy-dom
//
// DynamicTable infinite-scroll (opt-in) behaviour:
//   1. With `infiniteScroll`, the classic pager is replaced by a "N de total"
//      indicator; the first page loads with per_page=30 and the sentinel's
//      intersection appends the next page, deduped by id.
//   2. Changing the filters resets the accumulated list back to page 1.
//   3. WITHOUT the prop (default), the classic pager renders and no sentinel /
//      append path is engaged — existing hosts are untouched.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => () => {},
}))
const I18N = {
    t: (_k: string, o?: { defaultValue?: string; count?: number; total?: number }) => {
        // Mirror the "{{count}} de {{total}}" interpolation the footer uses.
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
        perPageOptions: [50],
        defaultPerPage: 50,
        searchPlaceholder: 'Buscar...',
        enableCRUDActions: false,
        hasActions: false,
    }
}

// A model with `total` rows. The data endpoint returns a page of {id,title};
// page 2 deliberately re-includes the last id of page 1 to exercise dedup.
function fakeApi(total: number, pageSize = 30): ApiClient {
    const ok = (data: unknown, extra: Record<string, unknown> = {}) => ({
        data: { success: true, data, meta: { total, ...extra } },
    })
    const page = (n: number) => {
        const start = (n - 1) * pageSize
        const rows: Array<{ id: number; title: string }> = []
        // Overlap: page n>1 repeats the previous page's last row (a server that
        // re-paginated) — dedupeById must drop it.
        const from = n > 1 ? start - 1 : start
        for (let i = from; i < Math.min(start + pageSize, total); i++) {
            rows.push({ id: i + 1, title: `Issue ${i + 1}` })
        }
        return rows
    }
    return {
        get: vi.fn(async (url: string, cfg?: any) => {
            if (url.startsWith('/metadata/table/')) return ok(meta())
            if (url.endsWith('/facets')) return ok([])
            // data endpoint
            const p = cfg?.params?.page ?? 1
            return ok(page(p))
        }),
        post: vi.fn(async () => ok(null)),
        put: vi.fn(async () => ok(null)),
        delete: vi.fn(async () => ok(null)),
    }
}

function dataCalls(api: ApiClient) {
    return (api.get as any).mock.calls.filter(
        (c: any[]) => c[0] === '/data/issue' || (c[0] === undefined),
    )
}

// Controllable IntersectionObserver — captures the observers so the test can
// fire the sentinel's intersection deterministically.
type IOEntry = { isIntersecting: boolean }
let observers: Array<{ fire: (v: boolean) => void }> = []
class FakeIO {
    cb: (e: IOEntry[]) => void
    constructor(cb: (e: IOEntry[]) => void) {
        this.cb = cb
        observers.push({ fire: (v: boolean) => this.cb([{ isIntersecting: v }]) })
    }
    observe() {}
    disconnect() {}
}

describe('DynamicTable infinite scroll', () => {
    beforeEach(() => {
        observers = []
        ;(globalThis as any).IntersectionObserver = FakeIO
    })
    afterEach(() => {
        delete (globalThis as any).IntersectionObserver
    })

    it('loads page 1 (per_page 30) then appends page 2 on intersect, deduped', async () => {
        useMetadataCache.getState().setMetadata('issue', meta())
        const api = fakeApi(45) // 45 rows → page1: 30, page2: 15 (+1 overlap dropped)
        render(
            <ApiProvider client={api}>
                <DynamicTable model="issue" infiniteScroll enableUrlSync={false} />
            </ApiProvider>,
        )

        // Page 1 request: page=1, per_page=30.
        await waitFor(() => {
            const first = dataCalls(api)[0]
            expect(first?.[1]?.params).toMatchObject({ page: 1, per_page: 30 })
        })
        // Footer indicator reflects the loaded/total counts.
        await waitFor(() => expect(screen.getByText('30 de 45')).toBeTruthy())

        // Sentinel enters view → page 2 fetched and APPENDED.
        expect(observers.length).toBeGreaterThan(0)
        observers.forEach((o) => o.fire(true))

        await waitFor(() => {
            const pages = dataCalls(api).map((c: any[]) => c[1]?.params?.page)
            expect(pages).toContain(2)
        })
        // 30 + 15 unique = 45 (NOT 46 — the overlap row was deduped).
        await waitFor(() => expect(screen.getByText('45 de 45')).toBeTruthy())
    })

    it('resets to page 1 (replacing the accumulated rows) when filters change', async () => {
        useMetadataCache.getState().setMetadata('issue', meta())
        const api = fakeApi(45)
        const { rerender } = render(
            <ApiProvider client={api}>
                <DynamicTable model="issue" infiniteScroll enableUrlSync={false} />
            </ApiProvider>,
        )
        await waitFor(() => expect(screen.getByText('30 de 45')).toBeTruthy())
        observers.forEach((o) => o.fire(true))
        await waitFor(() => expect(screen.getByText('45 de 45')).toBeTruthy())

        // Change the active filters via defaultFilters (part of buildFilterParams).
        rerender(
            <ApiProvider client={api}>
                <DynamicTable
                    model="issue"
                    infiniteScroll
                    enableUrlSync={false}
                    defaultFilters={{ stage: 'done' }}
                />
            </ApiProvider>,
        )

        // A fresh page-1 request carrying the new filter, and the list collapses
        // back to a single page (30 of 45) — the accumulated 45 were dropped.
        await waitFor(() => {
            const withFilter = dataCalls(api).filter(
                (c: any[]) => c[1]?.params?.f_stage === 'done',
            )
            expect(withFilter.some((c: any[]) => c[1]?.params?.page === 1)).toBe(true)
        })
        await waitFor(() => expect(screen.getByText('30 de 45')).toBeTruthy())
    })

    it('default (no prop) keeps the classic pager and never appends', async () => {
        useMetadataCache.getState().setMetadata('issue', meta())
        const api = fakeApi(45)
        render(
            <ApiProvider client={api}>
                <DynamicTable model="issue" enableUrlSync={false} />
            </ApiProvider>,
        )
        // Classic pager renders its rows-per-page control; the infinite footer
        // indicator ("N de N") is absent.
        await waitFor(() => expect(dataCalls(api).length).toBeGreaterThan(0))
        expect(screen.queryByText('30 de 45')).toBeNull()
        expect(screen.queryByText('45 de 45')).toBeNull()

        // Firing any (stray) sentinel must NOT trigger a page-2 append.
        observers.forEach((o) => o.fire(true))
        await new Promise((r) => setTimeout(r, 50))
        const pages = dataCalls(api).map((c: any[]) => c[1]?.params?.page)
        expect(pages).not.toContain(2)
    })
})
