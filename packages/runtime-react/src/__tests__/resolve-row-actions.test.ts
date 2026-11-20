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

    it('isActionConditionMet supports truthy/falsy (and the present/set/blank/empty aliases)', () => {
        const hasBalance = { condition: { field: 'amount_due', operator: 'truthy' } }
        const noBalance = { condition: { field: 'amount_due', operator: 'falsy' } }
        expect(isActionConditionMet(hasBalance, { amount_due: 6180 })).toBe(true)
        expect(isActionConditionMet(hasBalance, { amount_due: 0 })).toBe(false)
        expect(isActionConditionMet(hasBalance, { amount_due: undefined })).toBe(false)
        expect(isActionConditionMet(noBalance, { amount_due: 0 })).toBe(true)
        expect(isActionConditionMet(noBalance, { amount_due: 6180 })).toBe(false)
        expect(isActionConditionMet({ condition: { field: 'flag', operator: 'present' } }, { flag: 'x' })).toBe(true)
        expect(isActionConditionMet({ condition: { field: 'flag', operator: 'set' } }, { flag: false })).toBe(false)
        expect(isActionConditionMet({ condition: { field: 'flag', operator: 'blank' } }, { flag: '' })).toBe(true)
        expect(isActionConditionMet({ condition: { field: 'flag', operator: 'empty' } }, { flag: 'x' })).toBe(false)
    })

    it('isActionConditionMet resolves nested paths and equals/notEquals aliases', () => {
        const approve = {
            condition: { field: 'user.verified', operator: 'equals', value: false },
        }
        const revoke = {
            condition: { field: 'user.verified', operator: 'equals', value: true },
        }
        expect(isActionConditionMet(approve, { user: { verified: false } })).toBe(true)
        expect(isActionConditionMet(approve, { user: { verified: true } })).toBe(false)
        expect(isActionConditionMet(revoke, { user: { verified: true } })).toBe(true)
        expect(isActionConditionMet(revoke, { user: { verified: false } })).toBe(false)
        // Flat lookup must NOT match nested conditions (regression of row[field]).
        expect(isActionConditionMet(approve, { 'user.verified': false } as any)).toBe(false)
    })

    it('isActionConditionMet compares numerically (gt/gte/lt/lte) and composes with all/any', () => {
        const gt0 = { condition: { field: 'debt', operator: 'gt', value: '0' } }
        expect(isActionConditionMet(gt0, { debt: '12.50' })).toBe(true)
        expect(isActionConditionMet(gt0, { debt: 0 })).toBe(false)
        expect(isActionConditionMet(gt0, { debt: null })).toBe(false)
        expect(isActionConditionMet(gt0, { debt: 'abc' })).toBe(false)
        expect(isActionConditionMet({ condition: { field: 's', operator: 'lt', value: '5' } }, { s: 4 })).toBe(true)
        expect(isActionConditionMet({ condition: { field: 's', operator: 'lte', value: '5' } }, { s: 5 })).toBe(true)
        expect(isActionConditionMet({ condition: { field: 's', operator: 'gte', value: '5' } }, { s: 4 })).toBe(false)
        const both = {
            condition: {
                operator: 'all',
                field: '',
                value: '',
                conditions: [
                    { field: 'amount', operator: 'gt', value: '0' },
                    { field: 'cat', operator: 'neq', value: '4' },
                ],
            },
        }
        expect(isActionConditionMet(both, { amount: 10, cat: 1 })).toBe(true)
        expect(isActionConditionMet(both, { amount: 10, cat: 4 })).toBe(false)
        const either = { condition: { operator: 'any', field: '', value: '', conditions: [{ field: 'a', operator: 'truthy', value: '' }, { field: 'b', operator: 'truthy', value: '' }] } }
        expect(isActionConditionMet(either, { a: null, b: 1 })).toBe(true)
        expect(isActionConditionMet(either, { a: null, b: 0 })).toBe(false)
    })

    it('supports nested groups and legacy aliases stay intact', () => {
        const nested = {
            condition: {
                operator: 'any',
                conditions: [
                    { operator: 'all', conditions: [{ field: 'a', operator: 'gt', value: 1 }, { field: 'b', operator: 'falsy' }] },
                    { field: 'c', operator: 'in', value: [1, 2] },
                ],
            },
        }
        expect(isActionConditionMet(nested, { a: 2, b: 0, c: 9 })).toBe(true)
        expect(isActionConditionMet(nested, { a: 2, b: 1, c: 2 })).toBe(true)
        expect(isActionConditionMet(nested, { a: 2, b: 1, c: 9 })).toBe(false)
        expect(isActionConditionMet({ condition: { field: 'x', operator: 'notEquals', value: 'y' } }, { x: 'z' })).toBe(true)
        expect(isActionConditionMet({ condition: { field: 'x', operator: 'weird' } }, { x: 'z' })).toBe(true)
    })
})
