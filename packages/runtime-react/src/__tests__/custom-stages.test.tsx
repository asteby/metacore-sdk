// @vitest-environment happy-dom
//
// Custom stages coverage:
//   1. Pure helpers: splitCustomStages, mergeLaneStages, smartLaneParams,
//      isCustomStageDraftValid, slugifyStageKey, customStageFilterFields.
//   2. AddStageColumn renders + fires onClick.
//   3. CustomStageDialog: create a NORMAL stage (mock onCreate), edit a SMART
//      stage's condition value (mock onUpdate).
//   4. SmartLane queries the list endpoint with the lane's f_<field> params.
//   5. useCustomStages degrades to available=false when the endpoint 404s (the
//      "+ Agregar etapa" affordance never renders → board intact).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'

const I18N_T = (k: string, opts?: Record<string, any>) => {
    let s = (opts?.defaultValue as string) ?? k
    if (opts) {
        for (const [ok, ov] of Object.entries(opts)) {
            if (ok === 'defaultValue') continue
            s = s.replace(new RegExp(`{{${ok}}}`, 'g'), String(ov))
        }
    }
    return s
}
const I18N = { language: 'es' }
const USE_TRANSLATION = { t: I18N_T, i18n: I18N }
vi.mock('react-i18next', () => ({
    useTranslation: () => USE_TRANSLATION,
}))
vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => () => {},
}))

import {
    splitCustomStages,
    mergeLaneStages,
    resolveSmartLanes,
    smartLaneParams,
    isCustomStageDraftValid,
    slugifyStageKey,
    customStageFilterFields,
    emptyCustomStageFilter,
    AddStageColumn,
    CustomStageDialog,
    CustomStageDeleteDialog,
    SmartLane,
    useCustomStages,
    type CustomStage,
} from '../custom-stages'
import type { SmartLaneMeta } from '../types'
import { ApiProvider, type ApiClient } from '../api-context'
import type { ColumnDefinition, StageMeta } from '../types'
import React from 'react'

afterEach(cleanup)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COLUMNS: ColumnDefinition[] = [
    { key: 'title', label: 'Title', type: 'text', sortable: true, filterable: false },
    { key: 'priority', label: 'Priority', type: 'text', sortable: false, filterable: false },
    { key: 'id', label: 'ID', type: 'text', sortable: false, filterable: false },
    { key: 'secret', label: 'Secret', type: 'text', sortable: false, filterable: false, hidden: true },
]

const CUSTOM: CustomStage[] = [
    {
        id: 'c1',
        model: 'issue',
        key: 'review',
        label: 'En revisión',
        color: 'blue',
        position: 5,
        type: 'stage',
        filters: [],
        enabled: true,
    },
    {
        id: 'c2',
        model: 'issue',
        key: 'urgent',
        label: 'Urgentes',
        color: 'red',
        position: 6,
        type: 'smart',
        filters: [{ field: 'priority', op: 'eq', value: 'high' }],
        enabled: true,
    },
    {
        id: 'c3',
        model: 'issue',
        key: 'off',
        label: 'Deshabilitada',
        color: 'slate',
        position: 7,
        type: 'stage',
        filters: [],
        enabled: false,
    },
]

// ---------------------------------------------------------------------------
// 1. Pure helpers
// ---------------------------------------------------------------------------

describe('splitCustomStages', () => {
    it('splits enabled stages by flavor and drops disabled ones', () => {
        const { laneStages, smartStages } = splitCustomStages(CUSTOM)
        expect(laneStages.map((s) => s.key)).toEqual(['review'])
        expect(smartStages.map((s) => s.key)).toEqual(['urgent'])
    })
    it('tolerates undefined', () => {
        expect(splitCustomStages(undefined)).toEqual({ laneStages: [], smartStages: [] })
    })
})

describe('mergeLaneStages', () => {
    const declared: StageMeta[] = [
        { key: 'todo', label: 'Todo', order: 0 },
        { key: 'done', label: 'Done', order: 10 },
    ]
    it('appends unknown-key custom lanes, sorted by order/position', () => {
        const custom: CustomStage[] = [
            { ...CUSTOM[0], key: 'review', position: 5 },
        ]
        const { lanes, customByKey } = mergeLaneStages(declared, custom)
        expect(lanes.map((s) => s.key)).toEqual(['todo', 'review', 'done'])
        expect(customByKey.get('review')?.label).toBe('En revisión')
    })
    it('does not duplicate a custom lane the metadata already surfaced', () => {
        const custom: CustomStage[] = [{ ...CUSTOM[0], key: 'done' }]
        const { lanes, customByKey } = mergeLaneStages(declared, custom)
        expect(lanes.map((s) => s.key)).toEqual(['todo', 'done'])
        // Still tagged as custom so the lane gets its edit/delete menu.
        expect(customByKey.has('done')).toBe(true)
    })
})

describe('smartLaneParams', () => {
    it('encodes the operator as an OP: prefix on a single f_<field> param', () => {
        expect(
            smartLaneParams([
                { field: 'priority', op: 'eq', value: 'high' },
                { field: 'title', op: 'contains', value: 'bug' },
                { field: 'state', op: 'neq', value: 'closed' },
                { field: 'label', op: 'in', value: 'a,b' },
            ]),
        ).toEqual({
            f_priority: 'EQ:high',
            f_title: 'HAS:bug',
            f_state: 'NEQ:closed',
            f_label: 'IN:a,b',
        })
    })
    it('skips empty fields/values and tolerates undefined', () => {
        expect(smartLaneParams(undefined)).toEqual({})
        expect(
            smartLaneParams([
                { field: '', op: 'eq', value: 'x' },
                { field: 'a', op: 'eq', value: '  ' },
            ]),
        ).toEqual({})
    })
})

describe('isCustomStageDraftValid', () => {
    it('requires a label', () => {
        expect(isCustomStageDraftValid({ label: '', type: 'stage', filters: [] })).toBe(false)
        expect(isCustomStageDraftValid({ label: 'A', type: 'stage', filters: [] })).toBe(true)
    })
    it('requires at least one complete condition for smart lanes', () => {
        expect(
            isCustomStageDraftValid({ label: 'A', type: 'smart', filters: [emptyCustomStageFilter('x')] }),
        ).toBe(false)
        expect(
            isCustomStageDraftValid({
                label: 'A',
                type: 'smart',
                filters: [{ field: 'x', op: 'eq', value: '1' }],
            }),
        ).toBe(true)
    })
})

describe('slugifyStageKey / customStageFilterFields', () => {
    it('slugifies labels (accents, spaces, symbols)', () => {
        expect(slugifyStageKey('En Revisión!')).toBe('en_revision')
    })
    it('offers visible non-id columns for the condition builder', () => {
        expect(customStageFilterFields(COLUMNS).map((c) => c.key)).toEqual(['title', 'priority'])
    })
})

// ---------------------------------------------------------------------------
// 2. AddStageColumn
// ---------------------------------------------------------------------------

describe('AddStageColumn', () => {
    it('renders and fires onClick', () => {
        const onClick = vi.fn()
        render(<AddStageColumn onClick={onClick} />)
        fireEvent.click(screen.getByTestId('kanban-add-stage'))
        expect(onClick).toHaveBeenCalledTimes(1)
    })
})

// ---------------------------------------------------------------------------
// 3. CustomStageDialog
// ---------------------------------------------------------------------------

describe('CustomStageDialog', () => {
    it('creates a NORMAL stage with a slugified key and empty filters', async () => {
        const onCreate = vi.fn(async () => {})
        const onUpdate = vi.fn(async () => {})
        render(
            <CustomStageDialog
                open
                onOpenChange={() => {}}
                model="issue"
                columns={COLUMNS}
                initial={null}
                nextPosition={9}
                onCreate={onCreate}
                onUpdate={onUpdate}
            />,
        )
        fireEvent.change(screen.getByTestId('custom-stage-name'), {
            target: { value: 'En Progreso' },
        })
        fireEvent.click(screen.getByTestId('custom-stage-save'))
        await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
        expect(onCreate).toHaveBeenCalledWith({
            model: 'issue',
            key: 'en_progreso',
            label: 'En Progreso',
            color: 'slate',
            position: 9,
            type: 'stage',
            filters: [],
            enabled: true,
        })
    })

    it('save is disabled until the stage has a name', () => {
        render(
            <CustomStageDialog
                open
                onOpenChange={() => {}}
                model="issue"
                columns={COLUMNS}
                initial={null}
                nextPosition={0}
                onCreate={vi.fn()}
                onUpdate={vi.fn()}
            />,
        )
        expect((screen.getByTestId('custom-stage-save') as HTMLButtonElement).disabled).toBe(true)
    })

    it('edits a SMART stage: pre-fills conditions and updates the value', async () => {
        const onUpdate = vi.fn(async () => {})
        render(
            <CustomStageDialog
                open
                onOpenChange={() => {}}
                model="issue"
                columns={COLUMNS}
                initial={CUSTOM[1]}
                nextPosition={0}
                onCreate={vi.fn()}
                onUpdate={onUpdate}
            />,
        )
        // The smart lane's single condition renders pre-filled (value=high).
        const valueInput = screen.getByTestId('custom-stage-condition-value-0') as HTMLInputElement
        expect(valueInput.value).toBe('high')
        fireEvent.change(valueInput, { target: { value: 'critical' } })
        fireEvent.click(screen.getByTestId('custom-stage-save'))
        await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
        // type/model/key are immutable → the patch omits them (ops #704).
        expect(onUpdate).toHaveBeenCalledWith('c2', {
            label: 'Urgentes',
            color: 'red',
            filters: [{ field: 'priority', op: 'eq', value: 'critical' }],
        })
    })

    it('disables the type field when editing (type is immutable)', () => {
        render(
            <CustomStageDialog
                open
                onOpenChange={() => {}}
                model="issue"
                columns={COLUMNS}
                initial={CUSTOM[1]}
                nextPosition={0}
                onCreate={vi.fn()}
                onUpdate={vi.fn()}
            />,
        )
        expect(
            (screen.getByTestId('custom-stage-type') as HTMLButtonElement).disabled,
        ).toBe(true)
    })

    it('adds and removes condition rows for a smart lane', () => {
        render(
            <CustomStageDialog
                open
                onOpenChange={() => {}}
                model="issue"
                columns={COLUMNS}
                initial={CUSTOM[1]}
                nextPosition={0}
                onCreate={vi.fn()}
                onUpdate={vi.fn()}
            />,
        )
        expect(screen.getByTestId('custom-stage-condition-0')).toBeTruthy()
        fireEvent.click(screen.getByTestId('custom-stage-add-condition'))
        expect(screen.getByTestId('custom-stage-condition-1')).toBeTruthy()
        fireEvent.click(screen.getByTestId('custom-stage-condition-remove-1'))
        expect(screen.queryByTestId('custom-stage-condition-1')).toBeNull()
    })
})

// ---------------------------------------------------------------------------
// 4. SmartLane
// ---------------------------------------------------------------------------

function fakeApi(over: Partial<ApiClient> = {}): ApiClient {
    return {
        get: vi.fn(async () => ({ data: { success: true, data: [], meta: { total: 0 } } })),
        post: vi.fn(async () => ({ data: { success: true, data: null } })),
        put: vi.fn(async () => ({ data: { success: true, data: null } })),
        delete: vi.fn(async () => ({ data: { success: true, data: null } })),
        ...over,
    }
}

describe('SmartLane', () => {
    it('queries the list endpoint with the lane f_<field> params', async () => {
        const get = vi.fn(async () => ({
            data: { success: true, data: [{ id: 1, title: 'Bug' }], meta: { total: 1 } },
        }))
        render(
            <ApiProvider client={fakeApi({ get })}>
                <SmartLane
                    stage={CUSTOM[1]}
                    model="issue"
                    endpoint="/data/issue/me"
                    defaultFilters={{ archived: false }}
                    isDark={false}
                    onEdit={() => {}}
                    onDelete={() => {}}
                    renderCard={(c) => <div data-testid={`smart-card-${c.id}`}>{c.title}</div>}
                />
            </ApiProvider>,
        )
        await waitFor(() => expect(get).toHaveBeenCalled())
        const [url, cfg] = get.mock.calls[0] as [string, any]
        expect(url).toBe('/data/issue/me')
        expect(cfg.params).toMatchObject({ archived: false, f_priority: 'EQ:high' })
        await waitFor(() => expect(screen.getByTestId('smart-card-1')).toBeTruthy())
    })
})

// ---------------------------------------------------------------------------
// 4b. resolveSmartLanes — metadata-first with CRUD id fold-in
// ---------------------------------------------------------------------------

describe('resolveSmartLanes', () => {
    const metaLanes: SmartLaneMeta[] = [
        {
            key: 'urgent',
            label: 'Urgentes',
            color: 'red',
            order: 3,
            filters: [{ field: 'priority', op: 'eq', value: 'high' }],
        },
    ]
    it('maps metadata smart lanes, folding in the CRUD id by key', () => {
        const out = resolveSmartLanes(metaLanes, [CUSTOM[1]], 'issue')
        expect(out).toHaveLength(1)
        expect(out[0]).toMatchObject({
            id: 'c2', // folded in from the CRUD entry (metadata omits it)
            key: 'urgent',
            type: 'smart',
            filters: [{ field: 'priority', op: 'eq', value: 'high' }],
        })
    })
    it('synthesizes an id from the key when no CRUD match exists', () => {
        expect(resolveSmartLanes(metaLanes, [], 'issue')[0].id).toBe('urgent')
    })
    it('falls back to CRUD smart stages when metadata omits smart_lanes', () => {
        expect(resolveSmartLanes(undefined, [CUSTOM[1]], 'issue')).toEqual([CUSTOM[1]])
        expect(resolveSmartLanes([], [CUSTOM[1]], 'issue')).toEqual([CUSTOM[1]])
    })
})

// ---------------------------------------------------------------------------
// 4c. Delete dialog — 409 surfaces the card count + reassignment target
// ---------------------------------------------------------------------------

describe('CustomStageDeleteDialog', () => {
    it('on 409 shows the card count and retries with a reassign target', async () => {
        const onConfirm = vi
            .fn()
            .mockRejectedValueOnce({ response: { status: 409, data: { meta: { cards: 4 } } } })
            .mockResolvedValueOnce(undefined)
        render(
            <CustomStageDeleteDialog
                open
                onOpenChange={() => {}}
                stage={CUSTOM[0]}
                reassignTargets={[
                    { key: 'review', label: 'En revisión' }, // same key → filtered out
                    { key: 'done', label: 'Done' },
                ]}
                onConfirm={onConfirm}
            />,
        )
        // First attempt: plain delete, no reassign target.
        fireEvent.click(screen.getByTestId('custom-stage-delete-confirm'))
        await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
        expect(onConfirm).toHaveBeenLastCalledWith(CUSTOM[0], undefined)
        // Conflict mode: the reassign select appears; the count is surfaced.
        await waitFor(() => expect(screen.getByTestId('custom-stage-reassign')).toBeTruthy())
        expect(screen.getByText(/4/)).toBeTruthy()
        // Without a chosen target the confirm button stays a no-op (guarded).
        fireEvent.click(screen.getByTestId('custom-stage-delete-confirm'))
        expect(onConfirm).toHaveBeenCalledTimes(1)
    })
})

// ---------------------------------------------------------------------------
// 5. Hook degrades gracefully when the endpoint is missing
// ---------------------------------------------------------------------------

function HookProbe({ model }: { model: string }) {
    const c = useCustomStages(model)
    return (
        <div>
            <span data-testid="available">{String(c.available)}</span>
            <span data-testid="loading">{String(c.loading)}</span>
            <span data-testid="count">{c.stages.length}</span>
        </div>
    )
}

describe('useCustomStages', () => {
    it('loads stages when the endpoint is present', async () => {
        render(
            <ApiProvider client={fakeApi({ get: vi.fn(async () => ({ data: { success: true, data: CUSTOM } })) })}>
                <HookProbe model="issue" />
            </ApiProvider>,
        )
        await waitFor(() => expect(screen.getByTestId('available').textContent).toBe('true'))
        expect(screen.getByTestId('count').textContent).toBe('3')
    })

    it('reports available=false when the endpoint 404s (no board break)', async () => {
        const get = vi.fn(async () => {
            throw { response: { status: 404 } }
        })
        render(
            <ApiProvider client={fakeApi({ get })}>
                <HookProbe model="issue" />
            </ApiProvider>,
        )
        await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
        expect(screen.getByTestId('available').textContent).toBe('false')
        expect(screen.getByTestId('count').textContent).toBe('0')
    })
})
