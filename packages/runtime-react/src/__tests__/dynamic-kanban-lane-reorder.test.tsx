// @vitest-environment happy-dom
//
// DynamicKanban lane reordering (drag a column header to reorder lanes).
// happy-dom can't faithfully simulate a dnd-kit pointer drag, so we mock
// @dnd-kit/core + @dnd-kit/sortable down to a passthrough that CAPTURES the
// board's `onDragEnd`, then drive it with a synthetic lane / card drop. This
// exercises the real handler: optimistic reorder + `PUT /stage-layout` with the
// full new key order, revert on failure, and that a card drop still moves the
// card (not the lanes).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'

const I18N_T = (_k: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _k
const I18N = { language: 'es' }
const USE_TRANSLATION = { t: I18N_T, i18n: I18N }
vi.mock('react-i18next', () => ({
    useTranslation: () => USE_TRANSLATION,
}))

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => () => {},
}))

// Capture the board's drag callbacks so the test can fire a synthetic drop.
let captured: {
    onDragEnd?: (e: any) => void | Promise<void>
    onDragStart?: (e: any) => void
} = {}
vi.mock('@dnd-kit/core', () => ({
    DndContext: ({ children, onDragEnd, onDragStart }: any) => {
        captured.onDragEnd = onDragEnd
        captured.onDragStart = onDragStart
        return children
    },
    DragOverlay: ({ children }: any) => children ?? null,
    PointerSensor: class {},
    useSensor: () => ({}),
    useSensors: () => [],
    useDraggable: () => ({
        attributes: {},
        listeners: {},
        setNodeRef: () => {},
        isDragging: false,
    }),
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}))
vi.mock('@dnd-kit/sortable', async (orig) => {
    const actual = (await orig()) as Record<string, unknown>
    return {
        ...actual,
        SortableContext: ({ children }: any) => children,
        useSortable: () => ({
            setNodeRef: () => {},
            setActivatorNodeRef: () => {},
            attributes: {},
            listeners: {},
            transform: null,
            transition: undefined,
            isDragging: false,
            isOver: false,
        }),
    }
})

import { DynamicKanban } from '../dynamic-kanban'
import { ApiProvider, type ApiClient } from '../api-context'
import { useMetadataCache } from '../metadata-cache'
import type { TableMetadata } from '../types'

const STAGES = [
    { key: 'backlog', label: 'Backlog', color: 'slate', order: 0 },
    { key: 'in_progress', label: 'In Progress', color: 'blue', order: 1 },
    { key: 'review', label: 'Review', color: 'amber', order: 2 },
    { key: 'done', label: 'Done', color: 'green', order: 3 },
]

function meta(): TableMetadata {
    return {
        title: 'Issues',
        endpoint: '/data/issue',
        view_type: 'kanban',
        group_by: 'stage',
        stages: STAGES,
        transitions: [
            { from: 'backlog', to: 'in_progress' },
            { from: 'in_progress', to: 'review' },
            { from: 'review', to: 'done' },
        ],
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

const CARDS = [
    { id: 1, title: 'Fix login bug', stage: 'backlog' },
    { id: 7, title: 'E2E tests', stage: 'review' },
]

function fakeApi(over: Partial<ApiClient> = {}): ApiClient {
    const ok = (data: unknown) => ({ data: { success: true, data } })
    return {
        get: vi.fn(async (url: string) => {
            if (url.startsWith('/metadata/table/')) return ok(meta())
            if (url.startsWith('/stage-layout')) return ok({ model: 'issue', stage_order: null })
            if (url.startsWith('/custom-stages')) return { data: { success: false } }
            return ok(CARDS)
        }),
        post: vi.fn(async () => ok(null)),
        put: vi.fn(async () => ok(null)),
        delete: vi.fn(async () => ok(null)),
        ...over,
    }
}

const laneOrder = () =>
    Array.from(document.querySelectorAll('[data-stage]')).map((el) =>
        el.getAttribute('data-stage'),
    )

beforeEach(() => {
    captured = {}
})
afterEach(cleanup)

describe('DynamicKanban lane reorder', () => {
    it('an optimistic reorder PUTs the full new key order to /stage-layout', async () => {
        useMetadataCache.getState().setMetadata('issue', meta())
        const put = vi.fn(async () => ({ data: { success: true, data: null } }))
        render(
            <ApiProvider client={fakeApi({ put })}>
                <DynamicKanban model="issue" />
            </ApiProvider>,
        )
        await screen.findByText('Backlog')
        // baseline order
        await waitFor(() =>
            expect(laneOrder()).toEqual(['backlog', 'in_progress', 'review', 'done']),
        )

        // drag "in_progress" onto "backlog" (move index 1 → 0)
        await act(async () => {
            await captured.onDragEnd!({
                active: { id: 'in_progress', data: { current: { type: 'lane' } } },
                over: { id: 'backlog' },
            })
        })

        expect(put).toHaveBeenCalledWith('/stage-layout', {
            model: 'issue',
            stage_order: ['in_progress', 'backlog', 'review', 'done'],
        })
        // the board reflects the new order optimistically
        expect(laneOrder()).toEqual(['in_progress', 'backlog', 'review', 'done'])
    })

    it('reverts the order when the PUT fails', async () => {
        useMetadataCache.getState().setMetadata('issue', meta())
        const put = vi.fn(async (url: string) => {
            if (url === '/stage-layout') throw new Error('boom')
            return { data: { success: true, data: null } }
        })
        render(
            <ApiProvider client={fakeApi({ put })}>
                <DynamicKanban model="issue" />
            </ApiProvider>,
        )
        await screen.findByText('Backlog')
        await waitFor(() =>
            expect(laneOrder()).toEqual(['backlog', 'in_progress', 'review', 'done']),
        )

        await act(async () => {
            await captured.onDragEnd!({
                active: { id: 'done', data: { current: { type: 'lane' } } },
                over: { id: 'backlog' },
            })
        })

        expect(put).toHaveBeenCalledWith(
            '/stage-layout',
            expect.objectContaining({ stage_order: ['done', 'backlog', 'in_progress', 'review'] }),
        )
        // reverted back to the declared order
        await waitFor(() =>
            expect(laneOrder()).toEqual(['backlog', 'in_progress', 'review', 'done']),
        )
    })

    it('a card drop still moves the card (PUT to the record), not the lanes', async () => {
        useMetadataCache.getState().setMetadata('issue', meta())
        const put = vi.fn(async () => ({ data: { success: true, data: null } }))
        render(
            <ApiProvider client={fakeApi({ put })}>
                <DynamicKanban model="issue" />
            </ApiProvider>,
        )
        await screen.findByText('E2E tests')

        // card 7 review -> done (a declared transition)
        await act(async () => {
            await captured.onDragEnd!({
                active: { id: '7', data: { current: { type: 'card' } } },
                over: { id: 'done' },
            })
        })

        expect(put).toHaveBeenCalledWith('/data/issue/7', { stage: 'done' })
        // no /stage-layout PUT for a card move
        expect(put).not.toHaveBeenCalledWith('/stage-layout', expect.anything())
        // lane order unchanged
        expect(laneOrder()).toEqual(['backlog', 'in_progress', 'review', 'done'])
    })
})
