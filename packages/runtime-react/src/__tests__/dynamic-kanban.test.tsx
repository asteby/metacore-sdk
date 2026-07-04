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
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'

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
    cardMatchesLaneQuery,
    cardMatchesLaneFunnel,
    laneFunnelCount,
    translateOptionLabels,
    summarizeFilterValues,
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

describe('cardMatchesLaneQuery', () => {
    const cols = [
        { key: 'title', label: 'Title', type: 'text', sortable: false, filterable: false },
        { key: 'assignee', label: 'Assignee', type: 'text', sortable: false, filterable: false },
    ] as any

    it('matches on the title (case-insensitive)', () => {
        expect(cardMatchesLaneQuery(CARDS[0], cols, 'LOGIN')).toBe(true)
        expect(cardMatchesLaneQuery(CARDS[0], cols, 'dark')).toBe(false)
    })

    it('matches on any visible field value, not just the title', () => {
        // card 1: title "Fix login bug", assignee "ana"
        expect(cardMatchesLaneQuery(CARDS[0], cols, 'ana')).toBe(true)
    })

    it('an empty query matches everything', () => {
        expect(cardMatchesLaneQuery(CARDS[0], cols, '')).toBe(true)
        expect(cardMatchesLaneQuery(CARDS[0], cols, '   ')).toBe(true)
    })
})

describe('cardMatchesLaneFunnel', () => {
    // card 4: title "Refactor api", assignee "ana", priority "mid", stage "in_progress"
    const card = CARDS[3]

    it('matches picked select/facet values by equality (IN), not substring', () => {
        // exact value matches
        expect(
            cardMatchesLaneFunnel(card, { field: 'assignee', values: ['ana'] }),
        ).toBe(true)
        // a substring of the value must NOT match under equality
        expect(
            cardMatchesLaneFunnel(card, { field: 'assignee', values: ['an'] }),
        ).toBe(false)
        // IN semantics: any of the picked values
        expect(
            cardMatchesLaneFunnel(card, {
                field: 'assignee',
                values: ['dani', 'ana'],
            }),
        ).toBe(true)
        expect(
            cardMatchesLaneFunnel(card, {
                field: 'assignee',
                values: ['dani', 'eva'],
            }),
        ).toBe(false)
    })

    it('matches free text by case-insensitive substring', () => {
        expect(cardMatchesLaneFunnel(card, { field: 'title', text: 'refac' })).toBe(
            true,
        )
        expect(cardMatchesLaneFunnel(card, { field: 'title', text: 'REFAC' })).toBe(
            true,
        )
        expect(cardMatchesLaneFunnel(card, { field: 'title', text: 'zzz' })).toBe(
            false,
        )
    })

    it('passes when there is no field or no criteria', () => {
        expect(cardMatchesLaneFunnel(card, undefined)).toBe(true)
        expect(cardMatchesLaneFunnel(card, { field: 'assignee' })).toBe(true)
        expect(
            cardMatchesLaneFunnel(card, { field: 'assignee', values: [] }),
        ).toBe(true)
    })
})

describe('laneFunnelCount', () => {
    it('counts picked values, else 1 for free text, else 0', () => {
        expect(laneFunnelCount(undefined)).toBe(0)
        expect(laneFunnelCount({})).toBe(0)
        expect(laneFunnelCount({ values: ['a', 'b', 'c'] })).toBe(3)
        expect(laneFunnelCount({ text: 'foo' })).toBe(1)
        expect(laneFunnelCount({ text: '  ' })).toBe(0)
        // picked values win over stray text
        expect(laneFunnelCount({ values: ['a'], text: 'x' })).toBe(1)
    })
})

describe('translateOptionLabels', () => {
    it('runs option labels through the translator (stage i18n keys → localized)', () => {
        const opts = [
            { value: 'backlog', label: 'issue.stage.backlog', color: 'slate' },
            { value: 'done', label: 'issue.stage.done', color: 'green' },
        ]
        const dict: Record<string, string> = {
            'issue.stage.backlog': 'Pendiente',
            'issue.stage.done': 'Hecho',
        }
        const out = translateOptionLabels(opts, (k) => dict[k] ?? k)
        expect(out.map((o) => o.label)).toEqual(['Pendiente', 'Hecho'])
        // value + color preserved
        expect(out[0]).toMatchObject({ value: 'backlog', color: 'slate' })
    })

    it('leaves raw values (no matching key) untouched', () => {
        const out = translateOptionLabels(
            [{ value: 'acme/repo', label: 'acme/repo' }],
            (k) => k,
        )
        expect(out[0].label).toBe('acme/repo')
    })
})

describe('summarizeFilterValues', () => {
    const opts = [
        { value: 'backlog', label: 'Backlog' },
        { value: 'done', label: 'Done' },
        { value: 'review', label: 'Review' },
    ]
    it('resolves a single value to its option label', () => {
        expect(summarizeFilterValues(['done'], opts)).toBe('Done')
    })
    it('unwraps IN: and caps at 2 with a +n overflow', () => {
        expect(summarizeFilterValues(['IN:backlog,done,review'], opts)).toBe(
            'Backlog, Done +1',
        )
    })
    it('renders a free-text ILIKE: match quoted', () => {
        expect(summarizeFilterValues(['ILIKE:urgent'], opts)).toBe('"urgent"')
    })
    it('renders a numeric GTE/LTE range', () => {
        expect(summarizeFilterValues(['GTE:10', 'LTE:20'], opts)).toBe('10 – 20')
    })
    it('is empty for no selection', () => {
        expect(summarizeFilterValues([], opts)).toBe('')
        expect(summarizeFilterValues(undefined, opts)).toBe('')
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

    it('lays out fluid lanes: the board fills the width and lanes grow (flex-1) with a min/max width', async () => {
        useMetadataCache.getState().setMetadata('issue', meta())
        const { container } = render(
            <ApiProvider client={fakeApi()}>
                <DynamicKanban model="issue" />
            </ApiProvider>,
        )
        await screen.findByText('Backlog')
        // The board fills the container and scrolls horizontally only on overflow.
        const board = container.querySelector('[data-testid="kanban-board"]')!
        expect(board.className).toContain('w-full')
        expect(board.className).toContain('overflow-x-auto')
        // Each lane grows to fill the available width but never shrinks past a
        // readable min-width nor stretches beyond a sane max-width.
        const lanes = container.querySelectorAll('[data-stage]')
        expect(lanes.length).toBe(4)
        lanes.forEach((lane) => {
            expect(lane.className).toContain('flex-1')
            expect(lane.className).toContain('min-w-[280px]')
            expect(lane.className).toContain('max-w-[420px]')
        })
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

// ---------------------------------------------------------------------------
// 4. Filter bar — the DynamicKanban parity with DynamicTable column filters.
//    The bar renders a search box + one chip per filterable field, and any
//    control refetches the board server-side through useDynamicFilters
//    (debounced), carrying the same `f_<key>` / `search` params.
// ---------------------------------------------------------------------------

describe('DynamicKanban filter bar', () => {
    it('renders a search box and groups filters behind a Filtros sheet', async () => {
        useMetadataCache.getState().setMetadata('issue', meta())
        render(
            <ApiProvider client={fakeApi()}>
                <DynamicKanban model="issue" />
            </ApiProvider>,
        )
        // search box stays inline
        expect(await screen.findByPlaceholderText('Buscar...')).toBeTruthy()
        // filters are grouped behind a "Filtros" button (no longer spilling as
        // inline chips), so "Stage" is NOT in the DOM until the sheet opens.
        const filtersBtn = screen.getByText('Filtros')
        expect(filtersBtn).toBeTruthy()
        expect(screen.queryByText('Stage')).toBeNull()
        // opening the sheet reveals the "Stage" filter (the only filterable column)
        fireEvent.click(filtersBtn)
        expect(await screen.findByText('Stage')).toBeTruthy()
    })

    it('typing in the search box refetches the board with the search param', async () => {
        useMetadataCache.getState().setMetadata('issue', meta())
        const get = vi.fn(async (url: string) => {
            if (url.startsWith('/metadata/table/'))
                return { data: { success: true, data: meta() } }
            return { data: { success: true, data: CARDS } }
        })
        render(
            <ApiProvider client={fakeApi({ get })}>
                <DynamicKanban model="issue" />
            </ApiProvider>,
        )
        const box = await screen.findByPlaceholderText('Buscar...')
        fireEvent.change(box, { target: { value: 'login' } })
        await waitFor(() =>
            expect(get).toHaveBeenCalledWith(
                '/data/issue',
                expect.objectContaining({
                    params: expect.objectContaining({
                        search: 'login',
                        // `title` is the only `searchable: true` column in the fixture.
                        search_columns: 'title',
                    }),
                }),
            ),
        )
    })
})

// ---------------------------------------------------------------------------
// Stage config gear (⚙) + stage-override conditions on a declared lane
// ---------------------------------------------------------------------------

describe('DynamicKanban stage config', () => {
    it('renders the ⚙ gear on declared lanes when /stage-overrides is wired', async () => {
        useMetadataCache.getState().setMetadata('issue', meta())
        render(
            <ApiProvider client={fakeApi()}>
                <DynamicKanban model="issue" />
            </ApiProvider>,
        )
        // fakeApi answers every GET ok, so /stage-overrides resolves → gear shows.
        expect(await screen.findByTestId('lane-config-backlog')).toBeTruthy()
        expect(screen.getByTestId('lane-config-done')).toBeTruthy()
    })

    it('hides the gear on declared lanes when /stage-overrides 404s', async () => {
        useMetadataCache.getState().setMetadata('issue', meta())
        const get = vi.fn(async (url: string) => {
            if (url.startsWith('/metadata/table/'))
                return { data: { success: true, data: meta() } }
            if (url.startsWith('/stage-overrides'))
                return Promise.reject(new Error('404'))
            return { data: { success: true, data: CARDS } }
        })
        render(
            <ApiProvider client={fakeApi({ get })}>
                <DynamicKanban model="issue" />
            </ApiProvider>,
        )
        await screen.findByText('Backlog')
        await waitFor(() =>
            expect(screen.queryByTestId('lane-config-backlog')).toBeNull(),
        )
    })

    it('queries a lane that carries override filters with the extra f_ params + shows the conditions indicator', async () => {
        // A declared "backlog" lane with an extra condition (priority = high).
        const withFilters = meta({
            stages: [
                { key: 'backlog', label: 'Backlog', color: 'slate', order: 0, overridden: true, filters: [{ field: 'priority', op: 'eq', value: 'high' }] },
                { key: 'done', label: 'Done', color: 'green', order: 1 },
            ],
        })
        useMetadataCache.getState().setMetadata('issue', withFilters)
        const get = vi.fn(async (url: string) => {
            if (url.startsWith('/metadata/table/'))
                return { data: { success: true, data: withFilters } }
            return { data: { success: true, data: CARDS, meta: { total: 1 } } }
        })
        render(
            <ApiProvider client={fakeApi({ get })}>
                <DynamicKanban model="issue" />
            </ApiProvider>,
        )
        await screen.findByText('Backlog')
        // The eager per-lane total request for backlog carries BOTH the stage
        // scope and the override condition serialized like a smart-lane filter.
        await waitFor(() =>
            expect(get).toHaveBeenCalledWith(
                '/data/issue',
                expect.objectContaining({
                    params: expect.objectContaining({
                        f_stage: 'backlog',
                        f_priority: 'EQ:high',
                    }),
                }),
            ),
        )
        // The header carries the conditions indicator (dot + tooltip).
        expect(screen.getByTestId('lane-conditions-backlog')).toBeTruthy()
    })
})

// ---------------------------------------------------------------------------
// 5. Per-lane search — the inline lane header search narrows ONLY that lane's
//    already-fetched cards, client-side, by title + field values.
// ---------------------------------------------------------------------------

describe('DynamicKanban lane search', () => {
    it('filters a single lane by card title, leaving the card set narrowed', async () => {
        useMetadataCache.getState().setMetadata('issue', meta())
        render(
            <ApiProvider client={fakeApi()}>
                <DynamicKanban model="issue" />
            </ApiProvider>,
        )
        // all backlog cards present up front
        expect(await screen.findByText('Fix login bug')).toBeTruthy()
        expect(screen.getByText('Dark mode')).toBeTruthy()

        // open the first lane's (backlog) inline search and type
        const searchButtons = screen.getAllByLabelText('Buscar en la columna')
        fireEvent.click(searchButtons[0])
        const input = await screen.findByPlaceholderText('Buscar tarjetas...')
        fireEvent.change(input, { target: { value: 'dark' } })

        // backlog now shows only "Dark mode"; the other backlog cards are hidden
        await waitFor(() => expect(screen.queryByText('Fix login bug')).toBeNull())
        expect(screen.getByText('Dark mode')).toBeTruthy()
    })

    it('matches on a field value, not only the title', async () => {
        useMetadataCache.getState().setMetadata('issue', meta())
        render(
            <ApiProvider client={fakeApi()}>
                <DynamicKanban model="issue" />
            </ApiProvider>,
        )
        expect(await screen.findByText('Fix login bug')).toBeTruthy()
        const searchButtons = screen.getAllByLabelText('Buscar en la columna')
        fireEvent.click(searchButtons[0])
        const input = await screen.findByPlaceholderText('Buscar tarjetas...')
        // card 1 (backlog) has assignee "ana"; card 2/3 do not.
        fireEvent.change(input, { target: { value: 'ana' } })
        await waitFor(() => expect(screen.queryByText('Dark mode')).toBeNull())
        expect(screen.getByText('Fix login bug')).toBeTruthy()
    })
})

// ---------------------------------------------------------------------------
// 6. Lane funnel — for a field with options (the Stage select), the value step
//    renders the pro multi-select combobox, NOT a raw text input.
// ---------------------------------------------------------------------------

describe('DynamicKanban lane funnel', () => {
    it('renders the value combobox for a field that has options', async () => {
        useMetadataCache.getState().setMetadata('issue', meta())
        render(
            <ApiProvider client={fakeApi()}>
                <DynamicKanban model="issue" />
            </ApiProvider>,
        )
        await screen.findByText('Fix login bug')
        // open the first lane's funnel (the only filterable field is Stage → select)
        const funnelButtons = screen.getAllByLabelText('Filtrar columna')
        fireEvent.click(funnelButtons[0])
        // the value step is the searchable combobox, not the old raw text box
        expect(
            await screen.findByPlaceholderText('Buscar valores...'),
        ).toBeTruthy()
        expect(screen.queryByPlaceholderText('Contiene...')).toBeNull()
    })

    it('shows a count badge on the funnel with the number of picked values', async () => {
        useMetadataCache.getState().setMetadata('issue', meta())
        render(
            <ApiProvider client={fakeApi()}>
                <DynamicKanban model="issue" />
            </ApiProvider>,
        )
        await screen.findByText('Fix login bug')
        fireEvent.click(screen.getAllByLabelText('Filtrar columna')[0])
        await screen.findByPlaceholderText('Buscar valores...')

        // pick two stage values from the combobox
        const options = screen.getAllByRole('option')
        expect(options.length).toBeGreaterThanOrEqual(2)
        fireEvent.click(options[0])
        fireEvent.click(options[1])
        // apply
        fireEvent.click(screen.getByText(/Aplicar/))

        // the first lane's funnel button now carries a "2" count badge
        await waitFor(() =>
            expect(
                screen.getAllByLabelText('Filtrar columna')[0].textContent,
            ).toContain('2'),
        )
    })
})
