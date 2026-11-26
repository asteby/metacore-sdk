// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React, { useState } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { ApiProvider, BranchProvider } from '../api-context'
import { invalidateOptionsCache, optionsScope, useOptionsResolver, type ResolvedOption } from '../use-options-resolver'
import { reconcileAutoSelection, soleOptionToPreselect, useSoleOptionPreselect } from '../branch-scope'

const opt = (id: string, label = id): ResolvedOption => ({ id, value: id, label, name: label })

afterEach(() => {
    cleanup()
    invalidateOptionsCache()
    localStorage.clear()
})

describe('soleOptionToPreselect (pure rule)', () => {
    const base = { enabled: true, required: true, value: '', touched: false, options: [opt('us')], meta: null, loading: false, searching: false }

    it('selects the only option of a required, empty, untouched picker', () => {
        expect(soleOptionToPreselect(base)?.id).toBe('us')
    })
    it('does nothing with several options or none', () => {
        expect(soleOptionToPreselect({ ...base, options: [opt('us'), opt('mx')] })).toBeNull()
        expect(soleOptionToPreselect({ ...base, options: [] })).toBeNull()
    })
    it('does nothing when the server says there are more than the one listed', () => {
        expect(soleOptionToPreselect({ ...base, meta: { type: 'dynamic', count: 5 } })).toBeNull()
    })
    it('never overwrites a value, nor after the operator touched it', () => {
        expect(soleOptionToPreselect({ ...base, value: 'mx' })).toBeNull()
        expect(soleOptionToPreselect({ ...base, touched: true })).toBeNull()
    })
    it('waits for a settled, unfiltered lookup and only for required, enabled pickers', () => {
        expect(soleOptionToPreselect({ ...base, loading: true })).toBeNull()
        expect(soleOptionToPreselect({ ...base, searching: true })).toBeNull()
        expect(soleOptionToPreselect({ ...base, required: false })).toBeNull()
        expect(soleOptionToPreselect({ ...base, enabled: false })).toBeNull()
    })
})

describe('reconcileAutoSelection (after a branch switch)', () => {
    const settled = { loading: false, searching: false, meta: null }
    it('keeps a value the operator chose (no autoId)', () => {
        expect(reconcileAutoSelection({ ...settled, autoId: null, value: 'x', options: [opt('y')] })).toBe('keep')
    })
    it('keeps an auto value that is still offered', () => {
        expect(reconcileAutoSelection({ ...settled, autoId: 'us', value: 'us', options: [opt('us')] })).toBe('keep')
    })
    it('moves to the new sole option, or clears when none / several', () => {
        expect(reconcileAutoSelection({ ...settled, autoId: 'us', value: 'us', options: [opt('mx')] })).toEqual({ replaceWith: opt('mx') })
        expect(reconcileAutoSelection({ ...settled, autoId: 'us', value: 'us', options: [] })).toBe('clear')
        expect(reconcileAutoSelection({ ...settled, autoId: 'us', value: 'us', options: [opt('a'), opt('b')] })).toBe('clear')
    })
    it('waits while loading or searching', () => {
        expect(reconcileAutoSelection({ ...settled, loading: true, autoId: 'us', value: 'us', options: [] })).toBe('keep')
    })
})

function Harness({ options, branch, required = true, initial = '' }: { options: ResolvedOption[]; branch: string; required?: boolean; initial?: string }) {
    const [value, setValue] = useState<string>(initial)
    const { markTouched } = useSoleOptionPreselect({ enabled: true, required, value, options, loading: false, searching: false, onChange: setValue, branch })
    return (
        <div>
            <span data-testid="value">{value}</span>
            <button onClick={() => { markTouched(); setValue('picked') }}>pick</button>
        </div>
    )
}

describe('useSoleOptionPreselect', () => {
    it('preselects the sole option once the lookup settles', async () => {
        render(<Harness options={[opt('us')]} branch="b-us" />)
        await waitFor(() => expect(screen.getByTestId('value').textContent).toBe('us'))
    })
    it('leaves the field alone with several options', () => {
        render(<Harness options={[opt('us'), opt('mx')]} branch="b-us" />)
        expect(screen.getByTestId('value').textContent).toBe('')
    })
    it('leaves a value that came from a record, and a non-required field', () => {
        render(<Harness options={[opt('us')]} branch="b-us" initial="mx" />)
        expect(screen.getByTestId('value').textContent).toBe('mx')
        cleanup()
        render(<Harness options={[opt('us')]} branch="b-us" required={false} />)
        expect(screen.getByTestId('value').textContent).toBe('')
    })
    it('a branch switch clears the value it set and takes the new sole option', async () => {
        const { rerender } = render(<Harness options={[opt('us')]} branch="b-us" />)
        await waitFor(() => expect(screen.getByTestId('value').textContent).toBe('us'))
        rerender(<Harness options={[opt('mx')]} branch="b-mx" />)
        await waitFor(() => expect(screen.getByTestId('value').textContent).toBe('mx'))
        rerender(<Harness options={[]} branch="b-all" />)
        await waitFor(() => expect(screen.getByTestId('value').textContent).toBe(''))
    })
    it('never touches what the operator picked, even if the branch changes', async () => {
        const { rerender } = render(<Harness options={[opt('us')]} branch="b-us" />)
        await waitFor(() => expect(screen.getByTestId('value').textContent).toBe('us'))
        act(() => screen.getByText('pick').click())
        expect(screen.getByTestId('value').textContent).toBe('picked')
        rerender(<Harness options={[opt('mx')]} branch="b-mx" />)
        expect(screen.getByTestId('value').textContent).toBe('picked')
    })
})

describe('options cache and branch switches', () => {
    beforeEach(() => {
        localStorage.setItem('auth_user', JSON.stringify({ organization_id: 'org-1', id: 'u-1' }))
        localStorage.setItem('i18nextLng', 'es')
    })

    it('the cache scope carries the active branch', () => {
        localStorage.setItem('active_branch_id', 'b-us')
        const us = optionsScope()
        localStorage.setItem('active_branch_id', 'b-mx')
        const mx = optionsScope()
        localStorage.removeItem('active_branch_id')
        const all = optionsScope()
        expect(us).not.toBe('')
        expect(new Set([us, mx, all]).size).toBe(3)
    })

    it('a mounted picker refetches when the host switches the branch (no stale options)', async () => {
        const get = vi.fn(async (_url: string, cfg?: any) => {
            const branch = localStorage.getItem('active_branch_id')
            return { data: { success: true, data: [{ id: `w-${branch}`, label: `Almacén ${branch}` }] } }
        })
        const client: any = { get, post: vi.fn(async () => ({ data: { success: false } })), put: vi.fn(), delete: vi.fn(), interceptors: { response: { use: () => 0, eject: vi.fn() } } }
        function Picker() {
            const { options } = useOptionsResolver({ modelKey: '', ref: 'Warehouse', fieldKey: 'id' })
            return <span data-testid="opts">{options.map((o) => o.label).join(',')}</span>
        }
        function Host({ branch }: { branch: string }) {
            localStorage.setItem('active_branch_id', branch)
            return (
                <ApiProvider client={client}>
                    <BranchProvider branch={{ id: branch }}>
                        <Picker />
                    </BranchProvider>
                </ApiProvider>
            )
        }
        const { rerender } = render(<Host branch="us" />)
        await waitFor(() => expect(screen.getByTestId('opts').textContent).toBe('Almacén us'))
        rerender(<Host branch="mx" />)
        await waitFor(() => expect(screen.getByTestId('opts').textContent).toBe('Almacén mx'))
        expect(get).toHaveBeenCalledTimes(2)
    })
})
