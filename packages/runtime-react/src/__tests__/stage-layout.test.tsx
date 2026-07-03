// @vitest-environment happy-dom
//
// useStageLayout (per-org kanban lane-order persistence) + its non-intrusive
// gating in DynamicKanban: the reset affordance only shows when a custom order
// exists, and a missing `/stage-layout` endpoint leaves the board fully intact.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    cleanup,
    fireEvent,
    render,
    renderHook,
    screen,
    waitFor,
} from '@testing-library/react'
import React from 'react'

const I18N_T = (_k: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _k
const I18N = { language: 'es' }
const USE_TRANSLATION = { t: I18N_T, i18n: I18N }
vi.mock('react-i18next', () => ({
    useTranslation: () => USE_TRANSLATION,
}))
vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => () => {},
}))

import { useStageLayout } from '../stage-layout'
import { DynamicKanban } from '../dynamic-kanban'
import { ApiProvider, type ApiClient } from '../api-context'
import { useMetadataCache } from '../metadata-cache'
import type { TableMetadata } from '../types'

const STAGES = [
    { key: 'backlog', label: 'Backlog', color: 'slate', order: 0 },
    { key: 'in_progress', label: 'In Progress', color: 'blue', order: 1 },
    { key: 'done', label: 'Done', color: 'green', order: 2 },
]

function meta(): TableMetadata {
    return {
        title: 'Issues',
        endpoint: '/data/issue',
        view_type: 'kanban',
        group_by: 'stage',
        stages: STAGES,
        columns: [
            { key: 'title', label: 'Title', type: 'text', sortable: true, filterable: false, searchable: true },
            {
                key: 'stage',
                label: 'Stage',
                type: 'status',
                sortable: false,
                filterable: true,
                options: STAGES.map((s) => ({ value: s.key, label: s.label, color: s.color })),
            },
        ],
        actions: [],
        perPageOptions: [50],
        defaultPerPage: 50,
        searchPlaceholder: 'Buscar...',
        enableCRUDActions: true,
        hasActions: false,
    }
}

const CARDS = [{ id: 1, title: 'Fix login bug', stage: 'backlog' }]

function fakeApi(over: Partial<ApiClient> = {}, stageLayoutData: any = { model: 'issue', stage_order: null }): ApiClient {
    const ok = (data: unknown) => ({ data: { success: true, data } })
    return {
        get: vi.fn(async (url: string) => {
            if (url.startsWith('/metadata/table/')) return ok(meta())
            if (url.startsWith('/stage-layout')) return ok(stageLayoutData)
            if (url.startsWith('/custom-stages')) return { data: { success: false } }
            return ok(CARDS)
        }),
        post: vi.fn(async () => ok(null)),
        put: vi.fn(async () => ok(null)),
        delete: vi.fn(async () => ok(null)),
        ...over,
    }
}

const wrapper =
    (client: ApiClient) =>
    ({ children }: { children: React.ReactNode }) =>
        <ApiProvider client={client}>{children}</ApiProvider>

afterEach(cleanup)

describe('useStageLayout', () => {
    it('reports available + hasCustomLayout from the GET', async () => {
        const api = fakeApi({}, { model: 'issue', stage_order: ['done', 'backlog', 'in_progress'] })
        const { result } = renderHook(() => useStageLayout('issue'), {
            wrapper: wrapper(api),
        })
        await waitFor(() => expect(result.current.available).toBe(true))
        expect(result.current.hasCustomLayout).toBe(true)
    })

    it('is unavailable when the endpoint 404s (drag stays off)', async () => {
        const api = fakeApi({
            get: vi.fn(async (url: string) => {
                if (url.startsWith('/stage-layout')) throw new Error('404')
                return { data: { success: true, data: meta() } }
            }),
        })
        const { result } = renderHook(() => useStageLayout('issue'), {
            wrapper: wrapper(api),
        })
        // give the effect a tick
        await waitFor(() => expect(api.get).toHaveBeenCalled())
        await new Promise((r) => setTimeout(r, 0))
        expect(result.current.available).toBe(false)
        expect(result.current.hasCustomLayout).toBe(false)
    })

    it('save PUTs the full order and reset DELETEs', async () => {
        const put = vi.fn(async () => ({ data: { success: true, data: null } }))
        const del = vi.fn(async () => ({ data: { success: true, data: null } }))
        const api = fakeApi({ put, delete: del })
        const { result } = renderHook(() => useStageLayout('issue'), {
            wrapper: wrapper(api),
        })
        await waitFor(() => expect(result.current.available).toBe(true))

        await result.current.save(['done', 'backlog', 'in_progress'])
        expect(put).toHaveBeenCalledWith('/stage-layout', {
            model: 'issue',
            stage_order: ['done', 'backlog', 'in_progress'],
        })
        await waitFor(() => expect(result.current.hasCustomLayout).toBe(true))

        await result.current.reset()
        expect(del).toHaveBeenCalledWith('/stage-layout?model=issue')
    })

    it('save re-throws on a {success:false} envelope', async () => {
        const put = vi.fn(async () => ({ data: { success: false, message: 'nope' } }))
        const api = fakeApi({ put })
        const { result } = renderHook(() => useStageLayout('issue'), {
            wrapper: wrapper(api),
        })
        await waitFor(() => expect(result.current.available).toBe(true))
        await expect(result.current.save(['a', 'b'])).rejects.toThrow()
    })
})

describe('DynamicKanban stage-layout gating', () => {
    it('shows the reset-order affordance only when a custom order exists', async () => {
        useMetadataCache.getState().setMetadata('issue', meta())
        const api = fakeApi({}, { model: 'issue', stage_order: ['done', 'backlog', 'in_progress'] })
        render(
            <ApiProvider client={api}>
                <DynamicKanban model="issue" />
            </ApiProvider>,
        )
        await screen.findByText('Backlog')
        expect(
            await screen.findByTestId('kanban-reset-order'),
        ).toBeTruthy()
    })

    it('resets the order: DELETE + metadata refetch', async () => {
        useMetadataCache.getState().setMetadata('issue', meta())
        const del = vi.fn(async () => ({ data: { success: true, data: null } }))
        const api = fakeApi({ delete: del }, { model: 'issue', stage_order: ['done', 'backlog', 'in_progress'] })
        render(
            <ApiProvider client={api}>
                <DynamicKanban model="issue" />
            </ApiProvider>,
        )
        const btn = await screen.findByTestId('kanban-reset-order')
        const metaCallsBefore = (api.get as any).mock.calls.filter((c: any[]) =>
            String(c[0]).startsWith('/metadata/table/'),
        ).length
        fireEvent.click(btn)
        await waitFor(() => expect(del).toHaveBeenCalledWith('/stage-layout?model=issue'))
        // a fresh metadata GET followed the reset (falls back to declared order)
        await waitFor(() => {
            const after = (api.get as any).mock.calls.filter((c: any[]) =>
                String(c[0]).startsWith('/metadata/table/'),
            ).length
            expect(after).toBeGreaterThan(metaCallsBefore)
        })
    })

    it('a missing /stage-layout endpoint leaves the board intact (no reset, lanes + cards render)', async () => {
        useMetadataCache.getState().setMetadata('issue', meta())
        const api = fakeApi({
            get: vi.fn(async (url: string) => {
                if (url.startsWith('/metadata/table/')) return { data: { success: true, data: meta() } }
                if (url.startsWith('/stage-layout')) throw new Error('404')
                if (url.startsWith('/custom-stages')) return { data: { success: false } }
                return { data: { success: true, data: CARDS } }
            }),
        })
        render(
            <ApiProvider client={api}>
                <DynamicKanban model="issue" />
            </ApiProvider>,
        )
        // board still paints every lane + a card
        expect(await screen.findByText('Backlog')).toBeTruthy()
        expect(screen.getByText('Done')).toBeTruthy()
        expect(await screen.findByText('Fix login bug')).toBeTruthy()
        // no reset affordance without a wired endpoint
        expect(screen.queryByTestId('kanban-reset-order')).toBeNull()
    })
})
