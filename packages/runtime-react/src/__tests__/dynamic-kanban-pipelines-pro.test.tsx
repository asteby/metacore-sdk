// @vitest-environment happy-dom
//
// DynamicKanban "pipelines pro": the pure helpers behind the optimistic move,
// the lane totals, the card fields and the keyboard drag, plus the board
// behaviour they add up to — lanes a card can't enter are marked while it is
// lifted and refuse the drop (no request, no toast), a rejected move returns
// the card to its lane, lane headers show the declared totals in the org
// currency, and empty card fields are left out. dnd-kit is mocked down to a
// passthrough that captures the board's drag callbacks (happy-dom can't
// simulate a pointer drag).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'

const I18N_T = (_k: string, opts?: Record<string, any>) => {
    let s: string = opts?.defaultValue ?? _k
    for (const [k, v] of Object.entries(opts ?? {})) s = s.replace(`{{${k}}}`, String(v))
    return s
}
const I18N = { language: 'es-MX' }
const USE_TRANSLATION = { t: I18N_T, i18n: I18N }
vi.mock('react-i18next', () => ({
    useTranslation: () => USE_TRANSLATION,
}))

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => () => {},
}))

const toastError = vi.fn()
vi.mock('sonner', () => ({
    toast: Object.assign(vi.fn(), { error: (...a: any[]) => toastError(...a), success: vi.fn() }),
}))

let captured: {
    onDragEnd?: (e: any) => void | Promise<void>
    onDragStart?: (e: any) => void
    onDragOver?: (e: any) => void
} = {}
vi.mock('@dnd-kit/core', async (orig) => ({
    ...((await orig()) as Record<string, unknown>),
    DndContext: ({ children, onDragEnd, onDragStart, onDragOver }: any) => {
        captured.onDragEnd = onDragEnd
        captured.onDragStart = onDragStart
        captured.onDragOver = onDragOver
        return children
    },
    DragOverlay: ({ children }: any) => <div data-testid="drag-overlay">{children}</div>,
    useDraggable: () => ({
        attributes: {},
        listeners: {},
        setNodeRef: () => {},
        isDragging: false,
    }),
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}))
vi.mock('@dnd-kit/sortable', async (orig) => ({
    ...((await orig()) as Record<string, unknown>),
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
}))

import {
    DynamicKanban,
    applyLaneAggregatesOnMove,
    applyStageOverrides,
    cardMatchesLaneQuery,
    isEmptyCardValue,
    laneDeltasFromOverrides,
    nextLaneCoordinates,
    visibleCardFields,
} from '../dynamic-kanban'
import { PortalDragOverlay } from '../portal-drag-overlay'
import { ApiProvider, type ApiClient } from '../api-context'
import { OrgRuntimeProvider } from '../org-runtime-provider'
import { useMetadataCache } from '../metadata-cache'
import type { ColumnDefinition, TableMetadata } from '../types'

const col = (key: string, extra: Partial<ColumnDefinition> = {}): ColumnDefinition =>
    ({ key, label: key, type: 'text', sortable: false, filterable: false, ...extra }) as ColumnDefinition

// ---------------------------------------------------------------------------
// pure helpers
// ---------------------------------------------------------------------------

describe('card fields', () => {
    it('treats unset, blank, empty lists, false and bare uuids as empty', () => {
        const c = col('channel_id')
        expect(isEmptyCardValue({ channel_id: null }, c)).toBe(true)
        expect(isEmptyCardValue({ channel_id: '  ' }, c)).toBe(true)
        expect(isEmptyCardValue({ channel_id: [] }, c)).toBe(true)
        expect(isEmptyCardValue({ channel_id: false }, c)).toBe(true)
        expect(isEmptyCardValue({ channel_id: '5f0c6a1e-9a55-4c1e-9d0b-2a7f3e1c9b10' }, c)).toBe(true)
        expect(isEmptyCardValue({ channel_id: 'WhatsApp' }, c)).toBe(false)
        expect(isEmptyCardValue({ channel_id: 0 }, c)).toBe(false)
    })

    it('shows the first fields that carry a value, skipping empty ones', () => {
        const cols = [col('canal'), col('cliente'), col('asignado'), col('prioridad'), col('origen')]
        const card = { canal: null, cliente: 'ACME', asignado: '', prioridad: 'alta', origen: 'web' }
        expect(visibleCardFields(card, cols, 3).map((c) => c.key)).toEqual([
            'cliente',
            'prioridad',
            'origen',
        ])
        expect(visibleCardFields({}, cols, 3)).toEqual([])
    })
})

describe('optimistic overrides', () => {
    const records = [
        { id: 1, stage: 'backlog', amount: 100 },
        { id: 2, stage: 'review', amount: '50.5' },
    ]

    it('paints an unconfirmed move in its destination lane without touching the records', () => {
        const out = applyStageOverrides(records, { '1': 'review' }, 'stage')
        expect(out[0].stage).toBe('review')
        expect(records[0].stage).toBe('backlog')
        expect(applyStageOverrides(records, {}, 'stage')).toBe(records)
    })

    it('shifts lane counts and sums by the moves in flight', () => {
        const d = laneDeltasFromOverrides(records, { '1': 'review', '2': 'review' }, 'stage', ['amount'])
        expect(d.backlog).toEqual({ count: -1, sums: { amount: -100 } })
        expect(d.review).toEqual({ count: 1, sums: { amount: 100 } })
    })

    it('moves a confirmed card\'s values between lane totals', () => {
        const next = applyLaneAggregatesOnMove(
            { backlog: { amount: 300 }, review: { amount: 50 } },
            records[0],
            'backlog',
            'review',
            ['amount'],
        )
        expect(next).toEqual({ backlog: { amount: 200 }, review: { amount: 150 } })
    })
})

describe('keyboard drag', () => {
    const lanes = [
        { id: 'a', left: 0, top: 100, width: 300 },
        { id: 'b', left: 320, top: 100, width: 300 },
        { id: 'c', left: 640, top: 100, width: 300 },
    ]
    it('jumps to the neighbouring lane on ← / →', () => {
        const card = { left: 10, top: 180, width: 280 }
        expect(nextLaneCoordinates('right', card, lanes)).toEqual({ x: 330, y: 180 })
        expect(nextLaneCoordinates('left', card, lanes)).toBeUndefined()
        const inB = { left: 330, top: 120, width: 280 }
        expect(nextLaneCoordinates('left', inB, lanes)).toEqual({ x: 10, y: 156 })
    })
})

describe('lane search', () => {
    it('matches a relation by the name the card shows, not its uuid', () => {
        const cols = [col('contact', { type: 'relation' } as any)]
        const card = { contact: { id: 'u-1', name: 'Danny Pérez' } }
        expect(cardMatchesLaneQuery(card, cols, 'danny')).toBe(true)
        expect(cardMatchesLaneQuery(card, cols, 'u-1')).toBe(false)
    })
})

describe('PortalDragOverlay', () => {
    afterEach(cleanup)
    it('renders into <body>, outside a transformed / glass ancestor', () => {
        const { container } = render(
            <div style={{ backdropFilter: 'blur(8px)', transform: 'translateX(10px)' }}>
                <PortalDragOverlay>
                    <span>lifted</span>
                </PortalDragOverlay>
            </div>,
        )
        const overlay = screen.getByTestId('drag-overlay')
        expect(container.contains(overlay)).toBe(false)
        expect(overlay.parentElement).toBe(document.body)
    })
})

// ---------------------------------------------------------------------------
// board behaviour
// ---------------------------------------------------------------------------

const STAGES = [
    { key: 'nuevo', label: 'Nuevo', color: 'blue', order: 0 },
    { key: 'abierto', label: 'Abierto', color: 'violet', order: 1 },
    { key: 'esperando', label: 'Esperando', color: 'amber', order: 2 },
    { key: 'resuelto', label: 'Resuelto', color: 'green', order: 3 },
]

function meta(): TableMetadata {
    return {
        title: 'Bandeja',
        endpoint: '/data/conversations',
        view_type: 'kanban',
        group_by: 'status',
        stages: STAGES,
        transitions: [
            { from: 'nuevo', to: 'abierto' },
            { from: 'abierto', to: 'esperando' },
            { from: 'esperando', to: 'abierto' },
            { from: 'abierto', to: 'resuelto' },
        ],
        columns: [
            { key: 'title', label: 'Contacto', type: 'text', sortable: true, filterable: false, searchable: true },
            { key: 'channel', label: 'Canal', type: 'text', sortable: false, filterable: false },
            {
                key: 'amount',
                label: 'Monto',
                type: 'number',
                cellStyle: 'currency',
                styleConfig: { aggregate: 'sum' },
                sortable: false,
                filterable: false,
            },
            {
                key: 'status',
                label: 'Estado',
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
    } as TableMetadata
}

const CARDS = [
    { id: 1, title: 'Danny', channel: null, amount: 100, status: 'abierto' },
    { id: 2, title: 'Ana', channel: 'WhatsApp', amount: 40, status: 'esperando' },
]

function fakeApi(over: Partial<ApiClient> = {}): ApiClient {
    const ok = (data: unknown, meta?: unknown) => ({ data: { success: true, data, meta } })
    // A tiny server: a PUT persists, so the lane figures re-read after a move
    // reflect it.
    const db = CARDS.map((c) => ({ ...c }))
    return {
        get: vi.fn(async (url: string, config?: any) => {
            if (url.startsWith('/metadata/table/')) return ok(meta())
            if (url.startsWith('/stage-layout')) return ok({ model: 'conversations', stage_order: null })
            if (url.startsWith('/custom-stages') || url.startsWith('/stage-')) return { data: { success: false } }
            const stage = config?.params?.f_status
            if (url.endsWith('/aggregate')) {
                const amount = db.filter((c) => c.status === stage).reduce((a, c) => a + c.amount, 0)
                return ok({ amount })
            }
            const rows = stage ? db.filter((c) => c.status === stage) : db
            return ok(rows, { total: rows.length })
        }),
        post: vi.fn(async () => ok(null)),
        put: vi.fn(async (url: string, body: any) => {
            const row = db.find((c) => url.endsWith(`/${c.id}`))
            if (row) Object.assign(row, body)
            return ok(row ?? null)
        }),
        delete: vi.fn(async () => ok(null)),
        ...over,
    }
}

const laneOf = (text: string) =>
    screen.getByText(text).closest('[data-stage]')?.getAttribute('data-stage')

function renderBoard(api: ApiClient) {
    useMetadataCache.getState().setMetadata('conversations', meta())
    return render(
        <OrgRuntimeProvider currency="MXN">
            <ApiProvider client={api}>
                <DynamicKanban model="conversations" />
            </ApiProvider>
        </OrgRuntimeProvider>,
    )
}

beforeEach(() => {
    captured = {}
    toastError.mockReset()
})
afterEach(cleanup)

describe('DynamicKanban pipelines', () => {
    it('marks the lanes a lifted card cannot enter and refuses a drop there', async () => {
        const put = vi.fn(async () => ({ data: { success: true, data: null } }))
        renderBoard(fakeApi({ put }))
        await screen.findByText('Danny')

        act(() => {
            captured.onDragStart!({ active: { id: '1', data: { current: { type: 'card' } } } })
        })
        const drop = (key: string) =>
            document.querySelector(`[data-stage="${key}"]`)?.getAttribute('data-drop')
        // abierto → nuevo is not declared; abierto → esperando/resuelto are.
        expect(drop('nuevo')).toBe('blocked')
        expect(drop('esperando')).toBeNull()
        expect(drop('resuelto')).toBeNull()
        expect(drop('abierto')).toBeNull()

        act(() => {
            captured.onDragOver!({ active: { id: '1' }, over: { id: 'nuevo' } })
        })
        expect(screen.getByTestId('lane-blocked-nuevo')).toBeTruthy()

        await act(async () => {
            await captured.onDragEnd!({
                active: { id: '1', data: { current: { type: 'card' } } },
                over: { id: 'nuevo' },
            })
        })
        expect(put).not.toHaveBeenCalled()
        expect(toastError).not.toHaveBeenCalled()
        expect(laneOf('Danny')).toBe('abierto')
        expect(drop('nuevo')).toBeNull()
    })

    it('moves a card at once and sends it back when the server refuses', async () => {
        let reject!: (e: unknown) => void
        const put = vi.fn(
            () =>
                new Promise((_res, rej) => {
                    reject = rej
                }),
        )
        renderBoard(fakeApi({ put: put as any }))
        await screen.findByText('Danny')

        await act(async () => {
            await captured.onDragEnd!({
                active: { id: '1', data: { current: { type: 'card' } } },
                over: { id: 'resuelto' },
            })
        })
        expect(put.mock.calls[0]).toEqual(['/data/conversations/1', { status: 'resuelto' }])
        // Optimistic: already in the destination while the request is in flight.
        await waitFor(() => expect(laneOf('Danny')).toBe('resuelto'))

        await act(async () => {
            reject({ response: { data: { message: 'bloqueado por una regla' } } })
        })
        await waitFor(() => expect(laneOf('Danny')).toBe('abierto'))
        expect(toastError).toHaveBeenCalledWith(
            'No se pudo mover la tarjeta: bloqueado por una regla',
        )
    })

    it('shows each lane\'s declared total in the org currency and follows a move', async () => {
        renderBoard(fakeApi())
        await screen.findByText('Danny')
        const total = (key: string) =>
            screen.queryByTestId(`lane-total-${key}-amount`)?.textContent?.replace(/\s/g, ' ')
        await waitFor(() => expect(total('abierto')).toMatch(/100\.00/))
        expect(total('abierto')).toMatch(/\$/)
        expect(total('esperando')).toMatch(/40\.00/)

        await act(async () => {
            await captured.onDragEnd!({
                active: { id: '1', data: { current: { type: 'card' } } },
                over: { id: 'esperando' },
            })
        })
        await waitFor(() => expect(total('esperando')).toMatch(/140\.00/))
        expect(total('abierto')).toMatch(/0\.00/)
    })

    it('leaves out a card field with no value instead of a "Canal: —" row', async () => {
        renderBoard(fakeApi())
        const danny = (await screen.findByText('Danny')).closest('[data-card-id]') as HTMLElement
        const ana = screen.getByText('Ana').closest('[data-card-id]') as HTMLElement
        expect(danny.textContent).not.toContain('Canal')
        expect(ana.textContent).toContain('Canal')
        expect(ana.textContent).toContain('WhatsApp')
    })
})
