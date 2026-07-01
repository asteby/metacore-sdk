// resolveRowActions / isRowActionVisible — the shared seam that makes the
// kanban card menu show the SAME, capability-gated actions as the table's row
// action column (and hide an action the user lacks permission for).
import { describe, expect, it } from 'vitest'
import { resolveRowActions, makeCan } from '../permissions-context'
import { isRowActionVisible, isActionConditionMet } from '../dynamic-columns'
import type { TableMetadata } from '../types'

const allowAll = makeCan([], true)

function meta(over: Partial<TableMetadata> = {}): TableMetadata {
    return {
        title: 'Issues',
        endpoint: '/data/issue',
        view_type: 'kanban',
        group_by: 'stage',
        columns: [
            { key: 'title', label: 'Title', type: 'text', sortable: true, filterable: false, searchable: true },
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

describe('resolveRowActions', () => {
    it('materializes the implicit View/Edit/Delete trio for a CRUD model with no explicit actions', () => {
        const actions = resolveRowActions(meta(), 'issue', allowAll, false)
        expect(actions.map((a) => a.key)).toEqual(['view', 'edit', 'delete'])
    })

    it('returns nothing for a CRUD model once gating denies every capability', () => {
        const denyAll = makeCan([], false) // no caps, not admin
        const actions = resolveRowActions(meta(), 'issue', denyAll, true)
        expect(actions).toEqual([])
    })

    it('drops only the actions the user lacks permission for (index/update granted, delete denied)', () => {
        const can = makeCan(['issue.index', 'issue.update'], false)
        const actions = resolveRowActions(meta(), 'issue', can, true)
        // view→index, edit→update granted; delete denied → hidden
        expect(actions.map((a) => a.key)).toEqual(['view', 'edit'])
    })

    it('prefers explicit row actions and strips table/create placements', () => {
        const m = meta({
            actions: [
                { key: 'pagar', name: 'pagar', label: 'Pagar', placement: 'row' } as any,
                { key: 'export_all', name: 'export_all', label: 'Exportar', placement: 'table' } as any,
                { key: 'new_journal', name: 'new_journal', label: 'Nuevo', placement: 'create' } as any,
            ],
            hasActions: true,
        })
        const actions = resolveRowActions(m, 'issue', allowAll, false)
        expect(actions.map((a) => a.key)).toEqual(['pagar'])
    })
})

describe('isRowActionVisible', () => {
    it('combines the requiresState gate with the declarative condition', () => {
        const stateGated = { key: 'start', requiresState: ['reception'] }
        expect(isRowActionVisible(stateGated, { status: 'reception' })).toBe(true)
        expect(isRowActionVisible(stateGated, { status: 'in_progress' })).toBe(false)

        const condGated = { key: 'refund', condition: { field: 'paid', operator: 'eq', value: 'yes' } }
        expect(isRowActionVisible(condGated, { paid: 'yes' })).toBe(true)
        expect(isRowActionVisible(condGated, { paid: 'no' })).toBe(false)
    })

    it('isActionConditionMet supports eq/neq/in/not_in and is permissive without a condition', () => {
        expect(isActionConditionMet({}, { x: 1 })).toBe(true)
        expect(isActionConditionMet({ condition: { field: 's', operator: 'in', value: ['a', 'b'] } }, { s: 'b' })).toBe(true)
        expect(isActionConditionMet({ condition: { field: 's', operator: 'not_in', value: ['a', 'b'] } }, { s: 'c' })).toBe(true)
        expect(isActionConditionMet({ condition: { field: 's', operator: 'neq', value: 'a' } }, { s: 'a' })).toBe(false)
    })
})
