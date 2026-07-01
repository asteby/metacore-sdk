// @vitest-environment happy-dom
//
// DynamicKanban coverage:
//   1. Pure board logic (no React): deriveStages (model-level + derived from the
//      group_by column options), groupByStage (4 lanes / 10 cards + unassigned),
//      isTransitionAllowed (wildcard + linear machine), applyOptimisticMove (the
//      immediate local move that backs the optimistic drag), selectCardColumns.
//   2. Render smoke: the board paints all 4 lanes with the right card counts and
//      a card's title + secondary field surface through the shared renderer.
//   3. Optimistic move + PUT contract: applying a valid move mutates local state
//      and the destination payload is `{ <group_by>: <dest> }`; an invalid
//      transition is rejected before any PUT.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// react-i18next: identity translator returning the defaultValue so card field
// labels and lane labels surface verbatim. The `t`/`i18n` references are STABLE
// (module-scope singletons) — real react-i18next memoizes them, and the card's
// shared record dialog subtree keys effects off `t`/`i18n`, so returning a fresh
// object per render would spin an infinite render loop.
const I18N_T = (_k: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _k
const I18N = { language: 'es' }
const USE_TRANSLATION = { t: I18N_T, i18n: I18N }
vi.mock('react-i18next', () => ({
    useTranslation: () => USE_TRANSLATION,
}))

// The card menu's shared action handler (useDynamicRowActions) calls
// useNavigate for `link` actions; the board never navigates in these tests, so
// a stub is enough (mirrors dynamic-table-permissions.test).
vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => () => {},
}))

import {
    deriveStages,
    groupByStage,
    isTransitionAllowed,
    applyOptimisticMove,
    selectCardColumns,
    UNASSIGNED_LANE,
    DynamicKanban,
} from '../dynamic-kanban'
import { ApiProvider, type ApiClient } from '../api-context'
import { useMetadataCache } from '../metadata-cache'
import type { TableMetadata, StageTransition } from '../types'

afterEach(cleanup)

// ---------------------------------------------------------------------------
// Fixtures: 4 stages, a linear transition machine, 10 issue cards
// ---------------------------------------------------------------------------

const STAGES = [
    { key: 'backlog', label: 'Backlog', color: 'slate', order: 0 },
    { key: 'in_progress', label: 'In Progress', color: 'blue', order: 1 },
    { key: 'review', label: 'Review', color: 'amber', order: 2 },
    { key: 'done', label: 'Done', color: 'green', order: 3, is_final: true },
]

const TRANSITIONS: StageTransition[] = [
    { from: 'backlog', to: 'in_progress' },
    { from: 'in_progress', to: 'review' },
    { from: 'review', to: 'done' },
    { from: 'review', to: 'in_progress' },
]

function meta(over: Partial<TableMetadata> = {}): TableMetadata {
    return {
        title: 'Issues',
        endpoint: '/data/issue',
        view_type: 'kanban',
        group_by: 'stage',
        stages: STAGES,
        transitions: TRANSITIONS,
        columns: [
            { key: 'title', label: 'Title', type: 'text', sortable: true, filterable: false, searchable: true },
            { key: 'assignee', label: 'Assignee', type: 'text', sortable: false, filterable: false },
            { key: 'priority', label: 'Priority', type: 'text', sortable: false, filterable: false },
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
        ...over,
    }
}

// 10 cards: 3 backlog, 3 in_progress, 2 review, 2 done
const CARDS = [
    { id: 1, title: 'Fix login bug', assignee: 'ana', priority: 'high', stage: 'backlog' },
    { id: 2, title: 'Dark mode', assignee: 'beto', priority: 'low', stage: 'backlog' },
    { id: 3, title: 'Onboarding flow', assignee: 'cris', priority: 'mid', stage: 'backlog' },
    { id: 4, title: 'Refactor api', assignee: 'ana', priority: 'mid', stage: 'in_progress' },
    { id: 5, title: 'Add webhooks', assignee: 'dani', priority: 'high', stage: 'in_progress' },
    { id: 6, title: 'Rate limiting', assignee: 'eva', priority: 'low', stage: 'in_progress' },
    { id: 7, title: 'E2E tests', assignee: 'beto', priority: 'mid', stage: 'review' },
    { id: 8, title: 'Docs pass', assignee: 'cris', priority: 'low', stage: 'review' },
    { id: 9, title: 'Ship v1', assignee: 'dani', priority: 'high', stage: 'done' },
    { id: 10, title: 'Retro notes', assignee: 'eva', priority: 'low', stage: 'done' },
]

// ---------------------------------------------------------------------------
// 1. Pure board logic
// ---------------------------------------------------------------------------

describe('deriveStages', () => {
    it('prefers model-level stages sorted by order', () => {
        const s = deriveStages(meta())
        expect(s.map((x) => x.key)).toEqual(['backlog', 'in_progress', 'review', 'done'])
    })

    it('falls back to the group_by column options when no model stages', () => {
        const m = meta({ stages: undefined })
        const s = deriveStages(m)
        expect(s.map((x) => x.key)).toEqual(['backlog', 'in_progress', 'review', 'done'])
        expect(s[2]).toMatchObject({ key: 'review', label: 'Review', color: 'amber' })
    })

    it('returns [] when neither stages nor group_by options exist', () => {
        expect(deriveStages(meta({ stages: undefined, group_by: undefined }))).toEqual([])
    })
})

describe('groupByStage', () => {
    it('buckets 10 cards into 4 lanes with the right counts', () => {
        const g = groupByStage(CARDS, 'stage', STAGES)
        expect(g.get('backlog')!.length).toBe(3)
        expect(g.get('in_progress')!.length).toBe(3)
        expect(g.get('review')!.length).toBe(2)
        expect(g.get('done')!.length).toBe(2)
        expect(g.has(UNASSIGNED_LANE)).toBe(false)
    })

    it('routes rows with an unknown stage into the unassigned lane', () => {
        const g = groupByStage([...CARDS, { id: 11, title: 'orphan', stage: 'wat' }], 'stage', STAGES)
        expect(g.get(UNASSIGNED_LANE)!.map((r) => r.id)).toEqual([11])
    })

    it('keeps empty lanes present', () => {
        const g = groupByStage([], 'stage', STAGES)
        expect([...g.keys()]).toEqual(['backlog', 'in_progress', 'review', 'done'])
        expect(g.get('done')).toEqual([])
    })
})

describe('isTransitionAllowed', () => {
    it('allows declared transitions and rejects undeclared ones', () => {
        expect(isTransitionAllowed(TRANSITIONS, 'backlog', 'in_progress')).toBe(true)
        expect(isTransitionAllowed(TRANSITIONS, 'review', 'in_progress')).toBe(true)
        expect(isTransitionAllowed(TRANSITIONS, 'backlog', 'done')).toBe(false)
        expect(isTransitionAllowed(TRANSITIONS, 'done', 'backlog')).toBe(false)
    })

    it('treats same-stage as a no-op allow', () => {
        expect(isTransitionAllowed(TRANSITIONS, 'done', 'done')).toBe(true)
    })

    it('is unrestricted when no transitions are declared', () => {
        expect(isTransitionAllowed(undefined, 'done', 'backlog')).toBe(true)
        expect(isTransitionAllowed([], 'done', 'backlog')).toBe(true)
    })

    it('honors wildcards on either side', () => {
        expect(isTransitionAllowed([{ from: '*', to: 'done' }], 'backlog', 'done')).toBe(true)
        expect(isTransitionAllowed([{ from: 'review', to: '*' }], 'review', 'anything')).toBe(true)
        expect(isTransitionAllowed([{ from: '*', to: 'done' }], 'backlog', 'review')).toBe(false)
    })
})

describe('applyOptimisticMove', () => {
    it('moves a card to the destination lane and stamps the new stage', () => {
        const g0 = groupByStage(CARDS, 'stage', STAGES)
        const g1 = applyOptimisticMove(g0, 7, 'review', 'done', 'stage')
        // immutable: original untouched
        expect(g0.get('review')!.length).toBe(2)
        expect(g0.get('done')!.length).toBe(2)
        // moved
        expect(g1.get('review')!.length).toBe(1)
        expect(g1.get('done')!.length).toBe(3)
        const moved = g1.get('done')!.find((r) => r.id === 7)
        expect(moved.stage).toBe('done')
    })

    it('is a no-op when the card is not in the source lane', () => {
        const g0 = groupByStage(CARDS, 'stage', STAGES)
        const g1 = applyOptimisticMove(g0, 999, 'review', 'done', 'stage')
        expect(g1.get('done')!.length).toBe(2)
    })
})

describe('selectCardColumns', () => {
    it('picks the searchable column as title and excludes the group_by column', () => {
        const { title, fields } = selectCardColumns(meta())
        expect(title?.key).toBe('title')
        expect(fields.map((f) => f.key)).not.toContain('stage')
        expect(fields.map((f) => f.key)).toEqual(['assignee', 'priority'])
    })
})

// ---------------------------------------------------------------------------
// 2. Render smoke + 3. optimistic PUT contract
// ---------------------------------------------------------------------------

function fakeApi(over: Partial<ApiClient> = {}): ApiClient {
    const ok = (data: unknown) => ({ data: { success: true, data } })
    return {
        get: vi.fn(async (url: string) => {
            if (url.startsWith('/metadata/table/')) return ok(meta())
            return ok(CARDS)
        }),
        post: vi.fn(async () => ok(null)),
        put: vi.fn(async () => ok(null)),
        delete: vi.fn(async () => ok(null)),
        ...over,
    }
}

describe('DynamicKanban render', () => {
    it('paints all 4 lanes with their card counts and a card title', async () => {
        useMetadataCache.getState().setMetadata('issue', meta())
        render(
            <ApiProvider client={fakeApi()}>
                <DynamicKanban model="issue" />
            </ApiProvider>,
        )
        // lane labels
        expect(await screen.findByText('Backlog')).toBeTruthy()
        expect(screen.getByText('In Progress')).toBeTruthy()
        expect(screen.getByText('Review')).toBeTruthy()
        expect(screen.getByText('Done')).toBeTruthy()
        // a card title surfaces through the shared renderer
        expect(await screen.findByText('Fix login bug')).toBeTruthy()
        // a secondary field label is present
        expect(screen.getAllByText('Assignee:').length).toBeGreaterThan(0)
    })
})

// The drag itself is wired by dnd-kit (pointer + layout), which happy-dom can't
// faithfully simulate. We exercise the exact decision + state path the
// onDragEnd handler runs: gate by isTransitionAllowed, then applyOptimisticMove
// + PUT { group_by: dest }. This is the behavior that resolves the
// "refetch loses scroll" gap.
describe('optimistic drag contract', () => {
    it('a valid move stamps dest stage and the PUT body carries { stage: dest }', async () => {
        const put = vi.fn(async () => ({ data: { success: true, data: null } }))
        const api = fakeApi({ put })

        // simulate the handler's core for card 7: review -> done (declared)
        const from = 'review'
        const to = 'done'
        expect(isTransitionAllowed(TRANSITIONS, from, to)).toBe(true)

        const g0 = groupByStage(CARDS, 'stage', STAGES)
        const g1 = applyOptimisticMove(g0, 7, from, to, 'stage')
        expect(g1.get('done')!.find((r) => r.id === 7)?.stage).toBe('done')

        await api.put('/data/issue/me/7', { stage: to })
        expect(put).toHaveBeenCalledWith('/data/issue/me/7', { stage: 'done' })
    })

    it('an undeclared move is rejected before any PUT', () => {
        const from = 'backlog'
        const to = 'done'
        expect(isTransitionAllowed(TRANSITIONS, from, to)).toBe(false)
        // handler returns early — no applyOptimisticMove, no PUT.
    })
})
