// @vitest-environment happy-dom
//
// DynamicKanban eager lane totals (#521 follow-up): every lane header shows the
// REAL stage count on first render — before the user scrolls — by firing one
// lightweight `per_page=1` probe per declared stage after the initial board
// page. Covers:
//   1. formatLaneCount — the pure `N` vs `N/M` header formatter.
//   2. Totals visible without scrolling (partial `N/M` and complete `N`).
//   3. Totals refetch (scoped by the new filters) when the filters change.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => () => {},
}))
const I18N = { t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k, i18n: { language: 'es' } }
vi.mock('react-i18next', () => ({ useTranslation: () => I18N }))

import { formatLaneCount, DynamicKanban } from '../dynamic-kanban'
import { ApiProvider, type ApiClient } from '../api-context'
import { useMetadataCache } from '../metadata-cache'
import type { TableMetadata } from '../types'

afterEach(cleanup)

// ---------------------------------------------------------------------------
// 1. Pure formatter
// ---------------------------------------------------------------------------

describe('formatLaneCount', () => {
    it('shows just the total when everything is loaded (shown === total)', () => {
        expect(formatLaneCount(41, 41, 41, false)).toBe('41')
    })
    it('shows shown/total when the lane is partial', () => {
        expect(formatLaneCount(22, 22, 41, false)).toBe('22/41')
    })
    it('shows just the loaded count when the total is unknown', () => {
        expect(formatLaneCount(7, 7, null, false)).toBe('7')
    })
    it('shows shown/loaded when a lane filter is active', () => {
        expect(formatLaneCount(3, 22, 41, true)).toBe('3/22')
    })
    it('collapses to the total once shown catches up (never N/N)', () => {
        expect(formatLaneCount(5, 5, 5, false)).toBe('5')
    })
})

// ---------------------------------------------------------------------------
// 2 + 3. Component: eager totals on load and on filter change
// ---------------------------------------------------------------------------

const STAGES = [
    { key: 'backlog', label: 'Backlog', color: 'slate', order: 0 },
    { key: 'done', label: 'Done', color: 'green', order: 1 },
]

function meta(over: Partial<TableMetadata> = {}): TableMetadata {
    return {
        title: 'Issues',
        endpoint: '/data/issue',
        view_type: 'kanban',
        group_by: 'stage',
        stages: STAGES,
        columns: [
            { key: 'title', label: 'Title', type: 'text', sortable: true, filterable: false, searchable: true },
            { key: 'stage', label: 'Stage', type: 'status', sortable: false, filterable: true, options: STAGES.map((s) => ({ value: s.key, label: s.label })) },
        ],
        actions: [],
        perPageOptions: [50],
        defaultPerPage: 50,
        searchPlaceholder: 'Buscar...',
        enableCRUDActions: false,
        hasActions: false,
        ...over,
    }
}

// Initial global page: one backlog card + two done cards. The eager per_page=1
// probes report a backlog total of 5 (partial) and a done total of 2 (complete
// — the two done cards are already loaded).
function fakeApi(): ApiClient {
    const ok = (data: unknown, m?: Record<string, unknown>) => ({
        data: { success: true, data, ...(m ? { meta: m } : {}) },
    })
    return {
        get: vi.fn(async (url: string, cfg?: any) => {
            if (url.startsWith('/metadata/table/')) return ok(meta())
            const stage = cfg?.params?.f_stage
            if (stage === 'backlog') return ok([{ id: 1, title: 'Backlog One', stage: 'backlog' }], { total: 5 })
            if (stage === 'done') return ok([{ id: 2, title: 'Done Two', stage: 'done' }], { total: 2 })
            // initial global board page
            return ok([
                { id: 1, title: 'Backlog One', stage: 'backlog' },
                { id: 2, title: 'Done Two', stage: 'done' },
                { id: 3, title: 'Done Three', stage: 'done' },
            ])
        }),
        post: vi.fn(async () => ok(null)),
        put: vi.fn(async () => ok(null)),
        delete: vi.fn(async () => ok(null)),
    }
}

function totalProbeCalls(api: ApiClient) {
    return (api.get as any).mock.calls.filter(
        (c: any[]) => c[1]?.params?.f_stage !== undefined && c[1]?.params?.per_page === 1,
    )
}

describe('DynamicKanban eager lane totals', () => {
    beforeEach(() => {
        // No IntersectionObserver: nothing scrolls, so any total shown is proof
        // it arrived from the eager probe, not from a lane top-up.
        ;(globalThis as any).IntersectionObserver = class {
            observe() {}
            disconnect() {}
        }
    })
    afterEach(() => {
        delete (globalThis as any).IntersectionObserver
    })

    it('shows the real stage total on first render without scrolling', async () => {
        useMetadataCache.getState().setMetadata('issue', meta())
        const api = fakeApi()
        render(
            <ApiProvider client={api}>
                <DynamicKanban model="issue" />
            </ApiProvider>,
        )
        await screen.findByText('Backlog One')
        // Backlog: 1 loaded of 5 → partial. Done: 2 loaded of 2 → collapses to "2".
        expect(await screen.findByText('1/5')).toBeTruthy()
        expect(await screen.findByText('2')).toBeTruthy()
        // One probe per declared stage.
        await waitFor(() => expect(totalProbeCalls(api)).toHaveLength(2))
    })

    it('refetches the totals (scoped by the new filters) when the filters change', async () => {
        useMetadataCache.getState().setMetadata('issue', meta())
        const api = fakeApi()
        const { rerender } = render(
            <ApiProvider client={api}>
                <DynamicKanban model="issue" />
            </ApiProvider>,
        )
        await screen.findByText('1/5')
        await waitFor(() => expect(totalProbeCalls(api)).toHaveLength(2))

        rerender(
            <ApiProvider client={api}>
                <DynamicKanban model="issue" defaultFilters={{ priority: 'high' }} />
            </ApiProvider>,
        )

        // The filter change re-fires the eager probes (now carrying the filter).
        await waitFor(() => expect(totalProbeCalls(api).length).toBeGreaterThan(2))
        const probe = totalProbeCalls(api).at(-1)!
        expect(probe[1].params).toMatchObject({ f_priority: 'high', per_page: 1 })
    })
})
