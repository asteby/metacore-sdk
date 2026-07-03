// @vitest-environment happy-dom
//
// Stage automations coverage:
//   1. Pure helpers: isTagColumn, automationFieldOptions (per action type),
//      groupAutomationsByStage, activeAutomationCount.
//   2. Dialog render + create rule (mock fetch), toggle enabled, delete.
//   3. DynamicKanban stays intact when the /stage-automations endpoint 404s
//      (the ⚡ affordance simply never renders).
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
    isTagColumn,
    automationFieldOptions,
    groupAutomationsByStage,
    activeAutomationCount,
    StageAutomationsButton,
    useStageAutomations,
    type StageAutomation,
} from '../stage-automations'
import { ApiProvider, type ApiClient } from '../api-context'
import type { ColumnDefinition } from '../types'
import React from 'react'

afterEach(cleanup)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COLUMNS: ColumnDefinition[] = [
    { key: 'title', label: 'Title', type: 'text', sortable: true, filterable: false },
    { key: 'labels', label: 'Labels', type: 'tags', sortable: false, filterable: false },
    { key: 'priority', label: 'Priority', type: 'text', sortable: false, filterable: false },
    { key: 'id', label: 'ID', type: 'text', sortable: false, filterable: false, readonly: true } as ColumnDefinition,
    { key: 'secret', label: 'Secret', type: 'text', sortable: false, filterable: false, hidden: true },
]

const RULES: StageAutomation[] = [
    {
        id: 'r1',
        model: 'issue',
        from_stage: '*',
        to_stage: 'done',
        actions: [{ type: 'add_tag', field: 'labels', value: 'shipped' }],
        enabled: true,
    },
    {
        id: 'r2',
        model: 'issue',
        from_stage: '*',
        to_stage: 'done',
        actions: [{ type: 'set_field', field: 'priority', value: 'low' }],
        enabled: false,
    },
]

// ---------------------------------------------------------------------------
// 1. Pure helpers
// ---------------------------------------------------------------------------

describe('isTagColumn', () => {
    it('accepts tags/json columns and rejects plain fields', () => {
        expect(isTagColumn(COLUMNS[1])).toBe(true)
        expect(isTagColumn(COLUMNS[0])).toBe(false)
        expect(isTagColumn({ key: 'j', label: 'J', type: 'json' as any, sortable: false, filterable: false })).toBe(true)
    })
})

describe('automationFieldOptions', () => {
    it('offers only tag columns for add_tag / remove_tag', () => {
        expect(automationFieldOptions(COLUMNS, 'add_tag').map((c) => c.key)).toEqual(['labels'])
        expect(automationFieldOptions(COLUMNS, 'remove_tag').map((c) => c.key)).toEqual(['labels'])
    })
    it('offers all editable (non-readonly, non-hidden) columns for set_field', () => {
        expect(automationFieldOptions(COLUMNS, 'set_field').map((c) => c.key)).toEqual([
            'title',
            'labels',
            'priority',
        ])
    })
})

describe('groupAutomationsByStage / activeAutomationCount', () => {
    it('buckets by destination stage', () => {
        const m = groupAutomationsByStage(RULES)
        expect(m.get('done')!.length).toBe(2)
    })
    it('counts only enabled rules', () => {
        expect(activeAutomationCount(RULES)).toBe(1)
        expect(activeAutomationCount([])).toBe(0)
        expect(activeAutomationCount(undefined)).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// 2. Dialog: render, create, toggle, delete
// ---------------------------------------------------------------------------

function renderButton(over: Partial<React.ComponentProps<typeof StageAutomationsButton>> = {}) {
    const onCreate = vi.fn(async () => {})
    const onUpdate = vi.fn(async () => {})
    const onRemove = vi.fn(async () => {})
    render(
        <StageAutomationsButton
            model="issue"
            stageKey="done"
            stageLabel="Done"
            columns={COLUMNS}
            rules={RULES}
            onCreate={onCreate}
            onUpdate={onUpdate}
            onRemove={onRemove}
            {...over}
        />,
    )
    return { onCreate, onUpdate, onRemove }
}

describe('StageAutomationsButton', () => {
    it('shows the active-rule count badge (1 of 2 enabled)', () => {
        renderButton()
        const trigger = screen.getByTestId('automations-trigger-done')
        expect(trigger.textContent).toContain('1')
    })

    it('opens the dialog listing this stage rules with their summaries', () => {
        renderButton()
        fireEvent.click(screen.getByTestId('automations-trigger-done'))
        expect(screen.getByTestId('automation-rule-r1')).toBeTruthy()
        expect(screen.getByText(/Agregar tag "shipped" a Labels/)).toBeTruthy()
        expect(screen.getByText(/Setear Priority = "low"/)).toBeTruthy()
    })

    it('creates a rule with the picked action/field/value', async () => {
        const { onCreate } = renderButton()
        fireEvent.click(screen.getByTestId('automations-trigger-done'))
        // default action is add_tag → field defaults to the only tag column
        fireEvent.change(screen.getByTestId('automation-value-input'), {
            target: { value: 'urgent' },
        })
        fireEvent.click(screen.getByTestId('automation-add'))
        await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
        expect(onCreate).toHaveBeenCalledWith({
            model: 'issue',
            from_stage: '*',
            to_stage: 'done',
            actions: [{ type: 'add_tag', field: 'labels', value: 'urgent' }],
            enabled: true,
        })
    })

    it('toggles a rule enabled flag', () => {
        const { onUpdate } = renderButton()
        fireEvent.click(screen.getByTestId('automations-trigger-done'))
        fireEvent.click(screen.getByTestId('automation-toggle-r2'))
        expect(onUpdate).toHaveBeenCalledWith('r2', { enabled: true })
    })

    it('deletes a rule', async () => {
        const { onRemove } = renderButton()
        fireEvent.click(screen.getByTestId('automations-trigger-done'))
        fireEvent.click(screen.getByTestId('automation-delete-r1'))
        await waitFor(() => expect(onRemove).toHaveBeenCalledWith('r1'))
    })
})

// ---------------------------------------------------------------------------
// 3. Hook degrades gracefully when the endpoint is missing
// ---------------------------------------------------------------------------

function HookProbe({ model }: { model: string }) {
    const a = useStageAutomations(model)
    return (
        <div>
            <span data-testid="available">{String(a.available)}</span>
            <span data-testid="loading">{String(a.loading)}</span>
            <span data-testid="count">{a.byStage.get('done')?.length ?? 0}</span>
        </div>
    )
}

function fakeApi(over: Partial<ApiClient> = {}): ApiClient {
    return {
        get: vi.fn(async () => ({ data: { success: true, data: RULES } })),
        post: vi.fn(async () => ({ data: { success: true, data: null } })),
        put: vi.fn(async () => ({ data: { success: true, data: null } })),
        delete: vi.fn(async () => ({ data: { success: true, data: null } })),
        ...over,
    }
}

describe('useStageAutomations', () => {
    it('loads rules and groups them by destination stage', async () => {
        render(
            <ApiProvider client={fakeApi()}>
                <HookProbe model="issue" />
            </ApiProvider>,
        )
        await waitFor(() =>
            expect(screen.getByTestId('available').textContent).toBe('true'),
        )
        expect(screen.getByTestId('count').textContent).toBe('2')
    })

    it('reports available=false when the endpoint 404s (no kanban break)', async () => {
        const get = vi.fn(async () => {
            throw { response: { status: 404 } }
        })
        render(
            <ApiProvider client={fakeApi({ get })}>
                <HookProbe model="issue" />
            </ApiProvider>,
        )
        await waitFor(() =>
            expect(screen.getByTestId('loading').textContent).toBe('false'),
        )
        expect(screen.getByTestId('available').textContent).toBe('false')
        expect(screen.getByTestId('count').textContent).toBe('0')
    })
})
