// @vitest-environment happy-dom
//
// useDynamicFilters — the metadata-driven filter engine. Coverage for the
// "pro filters" upgrades:
//   A. A stage column with no options of its own inherits the pipeline stages
//      (colored) as a real `select` instead of falling back to a text box.
//   B. A plain text filterable column becomes a `facet` value-picker when a
//      facets endpoint is derivable (model), with a `loadOptions` loader that
//      hits `/data/<model>/facets`; long-text/body columns and the
//      no-model case stay a plain `text` filter (the graceful fallback).
import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import * as React from 'react'
import { useDynamicFilters } from '../use-dynamic-filters'
import { ApiProvider, type ApiClient } from '../api-context'
import type { TableMetadata } from '../types'

const STAGES = [
    { key: 'backlog', label: 'Backlog', color: 'slate', order: 0 },
    { key: 'in_progress', label: 'In Progress', color: 'blue', order: 1 },
    { key: 'done', label: 'Done', color: 'green', order: 2 },
]

function meta(over: Partial<TableMetadata> = {}): TableMetadata {
    return {
        title: 'Issues',
        endpoint: '/data/issue',
        view_type: 'kanban',
        group_by: 'stage',
        stages: STAGES,
        columns: [
            { key: 'title', label: 'Title', type: 'text', sortable: true, filterable: true, searchable: true },
            { key: 'body', label: 'Body', type: 'text', sortable: false, filterable: true, cellStyle: 'truncate-text' },
            {
                key: 'stage',
                label: 'Stage',
                type: 'status',
                sortable: false,
                filterable: true,
            },
        ],
        actions: [],
        perPageOptions: [50],
        defaultPerPage: 50,
        searchPlaceholder: 'Buscar...',
        enableCRUDActions: true,
        hasActions: false,
        ...over,
    }
}

function fakeApi(over: Partial<ApiClient> = {}): ApiClient {
    return {
        get: vi.fn(async () => ({
            data: {
                success: true,
                data: [
                    { value: 'ana', label: 'Ana', count: 3 },
                    { value: 'beto', label: 'Beto', count: 1 },
                ],
            },
        })),
        post: vi.fn(async () => ({ data: { success: true, data: null } })),
        put: vi.fn(async () => ({ data: { success: true, data: null } })),
        delete: vi.fn(async () => ({ data: { success: true, data: null } })),
        ...over,
    }
}

function wrapper(api: ApiClient) {
    return ({ children }: { children: React.ReactNode }) => (
        <ApiProvider client={api}>{children}</ApiProvider>
    )
}

describe('useDynamicFilters — stage as select (A)', () => {
    it('projects the pipeline stages (with colors) onto the stage column', () => {
        const { result } = renderHook(
            () => useDynamicFilters(meta(), { model: 'issue' }),
            { wrapper: wrapper(fakeApi()) },
        )
        const cfg = result.current.columnFilterConfigs.get('stage')
        expect(cfg?.filterType).toBe('select')
        expect(cfg?.options.map((o) => o.value)).toEqual([
            'backlog',
            'in_progress',
            'done',
        ])
        expect(cfg?.options.map((o) => o.color)).toEqual(['slate', 'blue', 'green'])
    })

    it('leaves the stage column as text when there are no stages', () => {
        const { result } = renderHook(
            () => useDynamicFilters(meta({ stages: [] }), { model: 'issue' }),
            { wrapper: wrapper(fakeApi()) },
        )
        // No stages and no options → text (upgraded to facet since a model is set).
        expect(result.current.columnFilterConfigs.get('stage')?.filterType).toBe(
            'facet',
        )
    })
})

describe('useDynamicFilters — facet upgrade + fallback (B)', () => {
    it('upgrades a plain text column to a facet with a working loader', async () => {
        const api = fakeApi()
        const { result } = renderHook(
            () => useDynamicFilters(meta(), { model: 'issue' }),
            { wrapper: wrapper(api) },
        )
        const cfg = result.current.columnFilterConfigs.get('title')
        expect(cfg?.filterType).toBe('facet')
        expect(typeof cfg?.loadOptions).toBe('function')

        const opts = await cfg!.loadOptions!('an')
        expect(api.get).toHaveBeenCalledWith(
            '/data/issue/facets',
            expect.objectContaining({
                params: expect.objectContaining({ field: 'title', q: 'an', limit: 50 }),
            }),
        )
        expect(opts).toEqual([
            { value: 'ana', label: 'Ana', count: 3 },
            { value: 'beto', label: 'Beto', count: 1 },
        ])
    })

    it('keeps long-text/body columns as a plain text filter (no faceting)', () => {
        const { result } = renderHook(
            () => useDynamicFilters(meta(), { model: 'issue' }),
            { wrapper: wrapper(fakeApi()) },
        )
        const cfg = result.current.columnFilterConfigs.get('body')
        expect(cfg?.filterType).toBe('text')
        expect(cfg?.loadOptions).toBeUndefined()
    })

    it('falls back to a plain text filter when no facets endpoint is derivable', () => {
        const { result } = renderHook(() => useDynamicFilters(meta()), {
            wrapper: wrapper(fakeApi()),
        })
        const cfg = result.current.columnFilterConfigs.get('title')
        expect(cfg?.filterType).toBe('text')
        expect(cfg?.loadOptions).toBeUndefined()
    })

    it('caches loader results per field+query (no refetch on reopen)', async () => {
        const api = fakeApi()
        const { result } = renderHook(
            () => useDynamicFilters(meta(), { model: 'issue' }),
            { wrapper: wrapper(api) },
        )
        const load = result.current.columnFilterConfigs.get('title')!.loadOptions!
        await load('')
        await load('')
        // Second call served from cache → only one network hit for that key.
        await waitFor(() =>
            expect((api.get as any).mock.calls.filter((c: any[]) =>
                String(c[0]).endsWith('/facets'),
            ).length).toBe(1),
        )
    })
})
