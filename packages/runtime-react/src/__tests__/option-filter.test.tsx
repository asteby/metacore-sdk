// @vitest-environment happy-dom
//
// `option_filter` / `optionFilter` on a relation picker hides options client-side
// (PIT-059: cancelled invoices must not show up in the payments selector).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { applyOptionFilter, getOptionFilter, optionPassesRule } from '../option-filter'
import { projectOption } from '../use-options-resolver'
import { DynamicSelectField } from '../dynamic-select-field'
import { ApiProvider, type ApiClient } from '../api-context'
import type { ActionFieldDef } from '../types'

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, o?: any) => o?.defaultValue ?? k, i18n: { language: 'es' } }),
}))

afterEach(cleanup)

const invoices = [
    { id: 'i1', label: 'FAC-1', status: 'timbrada', total: 100 },
    { id: 'i2', label: 'FAC-2', status: 'Cancelada', total: 50 },
    { id: 'i3', label: 'FAC-3', status: 'pendiente', total: 70 },
    { id: 'i4', label: 'FAC-4' },
].map(projectOption)

describe('getOptionFilter', () => {
    it('is empty when the field declares none (retrocompat)', () => {
        expect(getOptionFilter({ key: 'x' })).toEqual([])
        expect(getOptionFilter(undefined)).toEqual([])
    })
    it('reads camelCase and snake_case, one rule or a list', () => {
        const rule = { field: 'status', not_in: ['cancelada'] }
        expect(getOptionFilter({ optionFilter: rule })).toEqual([rule])
        expect(getOptionFilter({ option_filter: [rule] })).toEqual([rule])
    })
    it('ignores malformed rules', () => {
        expect(getOptionFilter({ option_filter: [{ nope: 1 }, null, { field: '' }] })).toEqual([])
    })
})

describe('applyOptionFilter', () => {
    it('returns the same array with no rules', () => {
        expect(applyOptionFilter(invoices, [])).toBe(invoices)
    })
    it('not_in hides cancelled invoices (case-insensitive) and keeps options without the column', () => {
        const out = applyOptionFilter(invoices, [{ field: 'status', not_in: ['cancelada'] }])
        expect(out.map((o) => o.id)).toEqual(['i1', 'i3', 'i4'])
    })
    it('notEquals alias and equals / in need the column to exist', () => {
        expect(applyOptionFilter(invoices, [{ field: 'status', notEquals: 'cancelada' }]).map((o) => o.id)).toEqual(['i1', 'i3', 'i4'])
        expect(applyOptionFilter(invoices, [{ field: 'status', equals: 'timbrada' }]).map((o) => o.id)).toEqual(['i1'])
        expect(applyOptionFilter(invoices, [{ field: 'status', in: ['timbrada', 'pendiente'] }]).map((o) => o.id)).toEqual(['i1', 'i3'])
    })
    it('combines rules with AND', () => {
        const out = applyOptionFilter(invoices, [
            { field: 'status', not_in: ['cancelada'] },
            { field: 'status', not_equals: 'pendiente' },
        ])
        expect(out.map((o) => o.id)).toEqual(['i1', 'i4'])
    })
    it('never hides the current selection', () => {
        const out = applyOptionFilter(invoices, [{ field: 'status', not_in: ['cancelada'] }], 'i2')
        expect(out.map((o) => o.id)).toEqual(['i1', 'i2', 'i3', 'i4'])
    })
    it('tests standard keys too (label)', () => {
        expect(optionPassesRule(invoices[0], { field: 'label', equals: 'fac-1' })).toBe(true)
    })
})

describe('DynamicSelectField with option_filter', () => {
    const field = (extra: Partial<ActionFieldDef> = {}): ActionFieldDef => ({
        key: 'invoice_id',
        label: 'Factura',
        type: 'dynamic_select',
        ref: 'invoices.Invoice',
        ...extra,
    })
    const api = () => {
        const get = vi.fn(async () => ({
            data: {
                success: true,
                data: [
                    { id: 'i1', label: 'FAC-1', status: 'timbrada' },
                    { id: 'i2', label: 'FAC-2', status: 'cancelada' },
                ],
                meta: { type: 'dynamic', count: 2 },
            },
        }))
        const post = vi.fn(async () => ({ data: { success: false } }))
        return { get, post } as unknown as ApiClient
    }
    const open = async (f: ActionFieldDef) => {
        render(
            <ApiProvider client={api()}>
                <DynamicSelectField field={f} value="" onChange={() => {}} />
            </ApiProvider>,
        )
        await act(async () => {
            screen.getByRole('combobox').click()
        })
    }

    it('lists every option without a filter', async () => {
        await open(field())
        await waitFor(() => expect(screen.getByText('FAC-2')).toBeTruthy())
        expect(screen.getByText('FAC-1')).toBeTruthy()
    })

    it('hides the cancelled invoice when the manifest declares option_filter', async () => {
        await open(field({ option_filter: { field: 'status', not_in: ['cancelada'] } }))
        await waitFor(() => expect(screen.getByText('FAC-1')).toBeTruthy())
        expect(screen.queryByText('FAC-2')).toBeNull()
        expect(within(document.body).queryAllByText('FAC-2')).toHaveLength(0)
    })
})
