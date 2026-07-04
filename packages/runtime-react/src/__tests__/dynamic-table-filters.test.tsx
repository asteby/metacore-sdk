// @vitest-environment happy-dom
//
// DynamicTable filter parity with the kanban:
//   - Facet PREFETCH: on metadata resolve, the table warms every facet field in
//     one burst (`/data/<model>/facets?field=<key>`), so a text-column header
//     filter opens instantly.
//   - Stage-select: the group_by/stage column with no options of its own becomes
//     a select (NOT a facet) — so it must NOT trigger a facets prewarm.
//   - Long-text columns stay plain text (no facet, no prewarm).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => () => {},
}))
const I18N = { t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k, i18n: { language: 'es' } }
vi.mock('react-i18next', () => ({ useTranslation: () => I18N }))

import { DynamicTable } from '../dynamic-table'
import { ApiProvider, type ApiClient } from '../api-context'
import { useMetadataCache } from '../metadata-cache'
import type { TableMetadata } from '../types'

afterEach(cleanup)

const STAGES = [
    { key: 'backlog', label: 'issue.stage.backlog', color: 'slate', order: 0 },
    { key: 'done', label: 'issue.stage.done', color: 'green', order: 1 },
]

function meta(): TableMetadata {
    return {
        title: 'Issues',
        endpoint: '/data/issue',
        group_by: 'stage',
        stages: STAGES,
        columns: [
            { key: 'title', label: 'Title', type: 'text', sortable: true, filterable: true, searchable: true },
            { key: 'body', label: 'Body', type: 'text', sortable: false, filterable: true, cellStyle: 'truncate-text' },
            { key: 'stage', label: 'Stage', type: 'status', sortable: false, filterable: true },
        ],
        actions: [],
        perPageOptions: [50],
        defaultPerPage: 50,
        searchPlaceholder: 'Buscar...',
        enableCRUDActions: true,
        hasActions: false,
    }
}

function fakeApi(): ApiClient {
    const ok = (data: unknown) => ({ data: { success: true, data, meta: { total: 0 } } })
    return {
        get: vi.fn(async (url: string, cfg?: any) => {
            if (url.startsWith('/metadata/table/')) return ok(meta())
            if (url.endsWith('/facets')) {
                const f = cfg?.params?.field
                return ok([
                    { value: `${f}-a`, label: `${f} A`, count: 2 },
                    { value: `${f}-b`, label: `${f} B`, count: 1 },
                ])
            }
            return ok([])
        }),
        post: vi.fn(async () => ok(null)),
        put: vi.fn(async () => ok(null)),
        delete: vi.fn(async () => ok(null)),
    }
}

function facetFields(api: ApiClient): string[] {
    return (api.get as any).mock.calls
        .filter((c: any[]) => String(c[0]).endsWith('/facets'))
        .map((c: any[]) => c[1]?.params?.field)
}

describe('DynamicTable facet prefetch + stage-select', () => {
    it('prewarms the plain text column but NOT the stage (select) or long-text columns', async () => {
        useMetadataCache.getState().setMetadata('issue', meta())
        const api = fakeApi()
        render(
            <ApiProvider client={api}>
                <DynamicTable model="issue" />
            </ApiProvider>,
        )
        // 'title' is a facet → it gets prewarmed against the model-derived endpoint
        await waitFor(() =>
            expect(
                (api.get as any).mock.calls.some(
                    (c: any[]) =>
                        String(c[0]) === '/data/issue/facets' &&
                        c[1]?.params?.field === 'title',
                ),
            ).toBe(true),
        )
        const fields = facetFields(api)
        // stage → select (from the pipeline stages), never faceted
        expect(fields).not.toContain('stage')
        // body → long-text, stays plain text, never faceted
        expect(fields).not.toContain('body')
    })

    it('hydrates a select filter from an `eq:` URL param as the bare value', async () => {
        // ?f_stage=eq:done must load as the plain option value `done` (green
        // funnel + checked option on reopen), not the raw `eq:done` string —
        // so the outgoing data request carries the bare value the backend maps
        // to equality.
        window.history.replaceState(null, '', '/x?f_stage=eq:done')
        useMetadataCache.getState().setMetadata('issue', meta())
        const api = fakeApi()
        render(
            <ApiProvider client={api}>
                <DynamicTable model="issue" />
            </ApiProvider>,
        )
        await waitFor(() => {
            const dataCall = (api.get as any).mock.calls.find(
                (c: any[]) =>
                    String(c[0]) === '/data/issue' && c[1]?.params?.f_stage != null,
            )
            expect(dataCall).toBeTruthy()
            expect(dataCall[1].params.f_stage).toBe('done')
        })
        window.history.replaceState(null, '', '/x')
    })
})
