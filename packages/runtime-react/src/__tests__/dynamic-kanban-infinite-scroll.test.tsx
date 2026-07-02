// @vitest-environment happy-dom
//
// DynamicKanban incremental (per-lane) loading:
//   1. applyLaneTotalsOnMove — the pure count adjustment that keeps a partial
//      lane's `count/total` header truthful across an optimistic drag.
//   2. A lane tops up its OWN stage on scroll: firing the sentinel issues
//      `f_<group_by>=<stage>&page=1&per_page=25` (on top of the active filters)
//      and appends the rows, with the header total taken from the response meta.
//   3. Changing the filters re-fetches the initial board page (resets the
//      per-lane pagination).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => () => {},
}))
const I18N = { t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k, i18n: { language: 'es' } }
vi.mock('react-i18next', () => ({ useTranslation: () => I18N }))

import { applyLaneTotalsOnMove, DynamicKanban } from '../dynamic-kanban'
import { ApiProvider, type ApiClient } from '../api-context'
import { useMetadataCache } from '../metadata-cache'
import type { TableMetadata } from '../types'

afterEach(cleanup)

// ---------------------------------------------------------------------------
// 1. Pure count adjustment
// ---------------------------------------------------------------------------

describe('applyLaneTotalsOnMove', () => {
    it('decrements the source total and increments the destination total', () => {
        const out = applyLaneTotalsOnMove(
            { backlog: { total: 5 }, done: { total: 2 } },
            'backlog',
            'done',
        )
        expect(out.backlog.total).toBe(4)
        expect(out.done.total).toBe(3)
    })

    it('leaves lanes with an unknown (null) total alone', () => {
        const out = applyLaneTotalsOnMove(
            { backlog: { total: null }, done: { total: 2 } },
            'backlog',
            'done',
        )
        expect(out.backlog.total).toBeNull()
        expect(out.done.total).toBe(3)
    })

    it('never drives a total below zero', () => {
        const out = applyLaneTotalsOnMove(
            { backlog: { total: 0 }, done: { total: 1 } },
            'backlog',
            'done',
        )
        expect(out.backlog.total).toBe(0)
        expect(out.done.total).toBe(2)
    })

    it('does not mutate the input map', () => {
        const input = { backlog: { total: 5 }, done: { total: 2 } }
        applyLaneTotalsOnMove(input, 'backlog', 'done')
        expect(input.backlog.total).toBe(5)
        expect(input.done.total).toBe(2)
    })
})

// ---------------------------------------------------------------------------
// 2 + 3. Per-lane top-up + reset
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

// Initial global page: one backlog card. A backlog top-up (f_stage=backlog)
// returns two more backlog cards with a server total of 5.
function fakeApi(): ApiClient {
    const ok = (data: unknown, meta?: Record<string, unknown>) => ({
        data: { success: true, data, ...(meta ? { meta } : {}) },
    })
    return {
        get: vi.fn(async (url: string, cfg?: any) => {
            if (url.startsWith('/metadata/table/')) return ok(meta())
            const stage = cfg?.params?.f_stage
            if (stage === 'backlog') {
                return ok(
                    [
                        { id: 2, title: 'Backlog Two', stage: 'backlog' },
                        { id: 3, title: 'Backlog Three', stage: 'backlog' },
                    ],
                    { total: 5 },
                )
            }
            if (stage === 'done') return ok([], { total: 0 })
            // initial global board page
            return ok([{ id: 1, title: 'Backlog One', stage: 'backlog' }])
        }),
        post: vi.fn(async () => ok(null)),
        put: vi.fn(async () => ok(null)),
        delete: vi.fn(async () => ok(null)),
    }
}

function stageCalls(api: ApiClient, stage: string) {
    return (api.get as any).mock.calls.filter(
        (c: any[]) => c[1]?.params?.f_stage === stage,
    )
}
function globalDataCalls(api: ApiClient) {
    return (api.get as any).mock.calls.filter(
        (c: any[]) =>
            !String(c[0]).startsWith('/metadata/table/') &&
            c[1]?.params?.f_stage === undefined,
    )
}

// Controllable IntersectionObserver.
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

describe('DynamicKanban per-lane infinite scroll', () => {
    beforeEach(() => {
        observers = []
        ;(globalThis as any).IntersectionObserver = FakeIO
    })
    afterEach(() => {
        delete (globalThis as any).IntersectionObserver
    })

    it('tops up ONE lane by stage on scroll and shows the server total', async () => {
        useMetadataCache.getState().setMetadata('issue', meta())
        const api = fakeApi()
        render(
            <ApiProvider client={api}>
                <DynamicKanban model="issue" />
            </ApiProvider>,
        )
        // Initial board page painted its single backlog card.
        expect(await screen.findByText('Backlog One')).toBeTruthy()
        expect(stageCalls(api, 'backlog')).toHaveLength(0)

        // Sentinels enter view → each declared lane tops up its OWN stage.
        expect(observers.length).toBeGreaterThan(0)
        observers.forEach((o) => o.fire(true))

        // The backlog top-up ran with the right scoped params...
        await waitFor(() => expect(stageCalls(api, 'backlog').length).toBeGreaterThan(0))
        const call = stageCalls(api, 'backlog')[0]
        expect(call[1].params).toMatchObject({ f_stage: 'backlog', page: 1, per_page: 25 })

        // ...its rows were appended and the header shows count/serverTotal (3/5).
        expect(await screen.findByText('Backlog Two')).toBeTruthy()
        expect(await screen.findByText('3/5')).toBeTruthy()
    })

    it('re-fetches the initial board page when the filters change (reset)', async () => {
        useMetadataCache.getState().setMetadata('issue', meta())
        const api = fakeApi()
        const { rerender } = render(
            <ApiProvider client={api}>
                <DynamicKanban model="issue" />
            </ApiProvider>,
        )
        await screen.findByText('Backlog One')
        const before = globalDataCalls(api).length

        rerender(
            <ApiProvider client={api}>
                <DynamicKanban model="issue" defaultFilters={{ priority: 'high' }} />
            </ApiProvider>,
        )

        // A fresh (un-scoped) board fetch fires — the per-lane pagination resets.
        await waitFor(() => expect(globalDataCalls(api).length).toBeGreaterThan(before))
    })
})
