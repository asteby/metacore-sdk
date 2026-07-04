// @vitest-environment happy-dom
//
// Stage overrides (the per-lane ⚙ gear) coverage:
//   1. useStageOverrides: available flips on GET success/404; save PUTs the
//      {model, stage_key, ...patch} body; reset DELETEs with model + stage_key.
//   2. cardMatchesStageFilters: the client-side belt-and-suspenders over the
//      unscoped initial board page (eq/neq/contains/in).
//   3. StageConfigDialog: a DECLARED lane saves via onSaveOverride + resets when
//      overridden; a CUSTOM lane saves via onUpdateCustom + deletes via onDelete.
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
const USE_TRANSLATION = { t: I18N_T, i18n: { language: 'es' } }
vi.mock('react-i18next', () => ({ useTranslation: () => USE_TRANSLATION }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import React from 'react'
import { cardMatchesStageFilters, StageConfigDialog, type CustomStage, type StageConfigTarget } from '../custom-stages'
import { useStageOverrides } from '../stage-overrides'
import { ApiProvider, type ApiClient } from '../api-context'
import type { ColumnDefinition } from '../types'

afterEach(cleanup)

const COLUMNS: ColumnDefinition[] = [
    { key: 'title', label: 'Title', type: 'text', sortable: true, filterable: false },
    { key: 'priority', label: 'Priority', type: 'text', sortable: false, filterable: false },
    { key: 'id', label: 'ID', type: 'text', sortable: false, filterable: false },
]

function fakeApi(over: Partial<ApiClient> = {}): ApiClient {
    const ok = (data: unknown) => ({ data: { success: true, data } })
    return {
        get: vi.fn(async () => ok([])),
        post: vi.fn(async () => ok(null)),
        put: vi.fn(async () => ok(null)),
        delete: vi.fn(async () => ok(null)),
        ...over,
    }
}

// ---------------------------------------------------------------------------
// 1. useStageOverrides
// ---------------------------------------------------------------------------

function OverridesProbe({ model }: { model: string }) {
    const o = useStageOverrides(model)
    return (
        <div>
            <span data-testid="available">{String(o.available)}</span>
            <button data-testid="save" onClick={() => void o.save('backlog', { label: 'Nuevo', color: 'blue', filters: [{ field: 'priority', op: 'eq', value: 'high' }] })} />
            <button data-testid="reset" onClick={() => void o.reset('backlog')} />
        </div>
    )
}

describe('useStageOverrides', () => {
    it('reports available after a successful GET and PUTs/DELETEs the right shape', async () => {
        const api = fakeApi()
        render(
            <ApiProvider client={api}>
                <OverridesProbe model="issue" />
            </ApiProvider>,
        )
        await waitFor(() => expect(screen.getByTestId('available').textContent).toBe('true'))
        expect(api.get).toHaveBeenCalledWith('/stage-overrides?model=issue')

        fireEvent.click(screen.getByTestId('save'))
        await waitFor(() =>
            expect(api.put).toHaveBeenCalledWith('/stage-overrides', {
                model: 'issue',
                stage_key: 'backlog',
                label: 'Nuevo',
                color: 'blue',
                filters: [{ field: 'priority', op: 'eq', value: 'high' }],
            }),
        )

        fireEvent.click(screen.getByTestId('reset'))
        await waitFor(() =>
            expect(api.delete).toHaveBeenCalledWith(
                '/stage-overrides?model=issue&stage_key=backlog',
            ),
        )
    })

    it('degrades to available=false when the endpoint 404s', async () => {
        const api = fakeApi({ get: vi.fn(async () => Promise.reject(new Error('404'))) })
        render(
            <ApiProvider client={api}>
                <OverridesProbe model="issue" />
            </ApiProvider>,
        )
        await waitFor(() => expect(screen.getByTestId('available').textContent).toBe('false'))
    })
})

// ---------------------------------------------------------------------------
// 2. cardMatchesStageFilters
// ---------------------------------------------------------------------------

describe('cardMatchesStageFilters', () => {
    it('applies eq / neq / contains (array + string) / in', () => {
        expect(cardMatchesStageFilters({ priority: 'high' }, [{ field: 'priority', op: 'eq', value: 'high' }])).toBe(true)
        expect(cardMatchesStageFilters({ priority: 'low' }, [{ field: 'priority', op: 'eq', value: 'high' }])).toBe(false)
        expect(cardMatchesStageFilters({ priority: 'low' }, [{ field: 'priority', op: 'neq', value: 'high' }])).toBe(true)
        // contains against a jsonb array membership + a string substring
        expect(cardMatchesStageFilters({ tags: ['a', 'b'] }, [{ field: 'tags', op: 'contains', value: 'b' }])).toBe(true)
        expect(cardMatchesStageFilters({ title: 'hello world' }, [{ field: 'title', op: 'contains', value: 'world' }])).toBe(true)
        // in: comma-separated candidates
        expect(cardMatchesStageFilters({ priority: 'mid' }, [{ field: 'priority', op: 'in', value: 'mid,high' }])).toBe(true)
        expect(cardMatchesStageFilters({ priority: 'low' }, [{ field: 'priority', op: 'in', value: 'mid,high' }])).toBe(false)
    })

    it('AND-combines multiple conditions and passes empty/blank ones', () => {
        expect(
            cardMatchesStageFilters({ priority: 'high', assignee: 'ana' }, [
                { field: 'priority', op: 'eq', value: 'high' },
                { field: 'assignee', op: 'eq', value: 'ana' },
            ]),
        ).toBe(true)
        expect(cardMatchesStageFilters({ priority: 'high' }, [])).toBe(true)
        expect(cardMatchesStageFilters({ priority: 'high' }, [{ field: 'priority', op: 'eq', value: '  ' }])).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// 3. StageConfigDialog
// ---------------------------------------------------------------------------

const DECLARED_TARGET: StageConfigTarget = {
    kind: 'declared',
    stageKey: 'backlog',
    label: 'Backlog',
    color: 'slate',
    filters: [],
    overridden: false,
}

const CUSTOM_STAGE: CustomStage = {
    id: 42,
    model: 'issue',
    key: 'urgent',
    label: 'Urgente',
    color: 'red',
    position: 5,
    type: 'stage',
    filters: [],
    enabled: true,
}

function renderConfig(target: StageConfigTarget, handlers: Partial<React.ComponentProps<typeof StageConfigDialog>> = {}) {
    const props = {
        open: true,
        onOpenChange: vi.fn(),
        columns: COLUMNS,
        target,
        onSaveOverride: vi.fn(async () => {}),
        onResetOverride: vi.fn(async () => {}),
        onUpdateCustom: vi.fn(async () => {}),
        onDeleteCustom: vi.fn(),
        ...handlers,
    }
    render(<StageConfigDialog {...props} />)
    return props
}

describe('StageConfigDialog', () => {
    it('a DECLARED lane saves label/color/conditions via onSaveOverride', async () => {
        const props = renderConfig(DECLARED_TARGET)
        fireEvent.change(screen.getByTestId('stage-config-name'), { target: { value: 'Pendientes' } })
        fireEvent.click(screen.getByTestId('stage-config-color-blue'))
        // add a condition
        fireEvent.click(screen.getByTestId('stage-config-add-first-condition'))
        fireEvent.change(screen.getByTestId('custom-stage-condition-value-0'), { target: { value: 'high' } })
        fireEvent.click(screen.getByTestId('stage-config-save'))
        await waitFor(() => expect(props.onSaveOverride).toHaveBeenCalled())
        const [stageKey, patch] = (props.onSaveOverride as any).mock.calls[0]
        expect(stageKey).toBe('backlog')
        expect(patch.label).toBe('Pendientes')
        expect(patch.color).toBe('blue')
        expect(patch.filters).toEqual([{ field: 'title', op: 'eq', value: 'high' }])
    })

    it('shows "Restablecer etapa" only when the declared lane is overridden', () => {
        renderConfig({ ...DECLARED_TARGET, overridden: false })
        expect(screen.queryByTestId('stage-config-reset')).toBeNull()
        cleanup()
        const props = renderConfig({ ...DECLARED_TARGET, overridden: true })
        const reset = screen.getByTestId('stage-config-reset')
        fireEvent.click(reset)
        expect(props.onResetOverride).toHaveBeenCalledWith('backlog')
    })

    it('a CUSTOM lane saves via onUpdateCustom and deletes via onDeleteCustom', async () => {
        const target: StageConfigTarget = {
            kind: 'custom',
            stageKey: 'urgent',
            id: 42,
            label: 'Urgente',
            color: 'red',
            filters: [],
            customStage: CUSTOM_STAGE,
        }
        const props = renderConfig(target)
        expect(screen.queryByTestId('stage-config-reset')).toBeNull()
        fireEvent.change(screen.getByTestId('stage-config-name'), { target: { value: 'Muy urgente' } })
        fireEvent.click(screen.getByTestId('stage-config-save'))
        await waitFor(() => expect(props.onUpdateCustom).toHaveBeenCalled())
        const [id, patch] = (props.onUpdateCustom as any).mock.calls[0]
        expect(id).toBe(42)
        expect(patch.label).toBe('Muy urgente')

        fireEvent.click(screen.getByTestId('stage-config-delete'))
        expect(props.onDeleteCustom).toHaveBeenCalledWith(CUSTOM_STAGE)
    })
})
