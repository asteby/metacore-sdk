// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import {
    applyOptionFitment,
    getOptionFitment,
    loadTargetRows,
    modelOfRef,
    resetOptionFitmentCache,
    resolveFitmentSubjectId,
    useOptionFitment,
    resetFitmentCache,
    type OptionFitmentSpec,
} from '../fitment'
import type { ResolvedOption } from '../use-options-resolver'

const opt = (id: string, extra: Partial<ResolvedOption> = {}): ResolvedOption => ({ id, value: id, label: `P-${id}`, name: `P-${id}`, ...extra })
const TEXT = { fits: 'Compatible', no: 'No compatible' }

describe('getOptionFitment / resolveFitmentSubjectId / modelOfRef', () => {
    it('reads snake_case and camelCase; null when absent or incomplete', () => {
        const spec = { subject_field: 'vehicle_id', subject_model: 'Vehicle', target_model: 'TireSpec' }
        expect(getOptionFitment({ option_fitment: spec })).toEqual({ ...spec, mode: 'flag' })
        expect(getOptionFitment({ optionFitment: { subjectField: 'v', subjectModel: 'V', targetModel: 'T', mode: 'filter' } })).toEqual({
            subject_field: 'v', subject_model: 'V', target_model: 'T', mode: 'filter',
        })
        expect(getOptionFitment({})).toBeNull()
        expect(getOptionFitment({ option_fitment: { subject_field: 'v' } })).toBeNull()
        expect(getOptionFitment(null)).toBeNull()
    })
    it('subject: the row wins over the header; blank is empty', () => {
        const spec = getOptionFitment({ option_fitment: { subject_field: 'vehicle_id', subject_model: 'V', target_model: 'T' } })
        expect(resolveFitmentSubjectId(spec, { vehicle_id: 'H' }, { vehicle_id: 'R' })).toBe('R')
        expect(resolveFitmentSubjectId(spec, { vehicle_id: 'H' }, {})).toBe('H')
        expect(resolveFitmentSubjectId(spec, {}, { vehicle_id: '' })).toBe('')
        expect(resolveFitmentSubjectId(null, { vehicle_id: 'H' })).toBe('')
    })
    it('model of an addon-qualified ref', () => {
        expect(modelOfRef('products.Product')).toBe('Product')
        expect(modelOfRef('Product')).toBe('Product')
        expect(modelOfRef(undefined)).toBe('')
    })
})

describe('applyOptionFitment', () => {
    const options = [opt('a'), opt('b'), opt('c')]
    const states = new Map<string, 'fits' | 'no' | 'unknown'>([['a', 'fits'], ['b', 'no'], ['c', 'unknown']])
    it('filter hides the non-fitting ones but never the current selection', () => {
        expect(applyOptionFitment(options, states, 'filter', TEXT).map((o) => o.id)).toEqual(['a', 'c'])
        expect(applyOptionFitment(options, states, 'filter', TEXT, 'b').map((o) => o.id)).toEqual(['a', 'b', 'c'])
    })
    it('flag keeps every option, badges fits/no, dims no, leaves unknown untouched', () => {
        const out = applyOptionFitment(options, states, 'flag', TEXT)
        expect(out).toHaveLength(3)
        expect(out[0]).toMatchObject({ fit: 'fits', display: { title: 'P-a', badges: [{ text: 'Compatible', tone: 'success' }] } })
        expect(out[1]).toMatchObject({ fit: 'no', display: { badges: [{ text: 'No compatible', tone: 'warning' }], dimmed: true } })
        expect(out[2]).toBe(options[2])
    })
    it('keeps existing display (title, badges) and appends', () => {
        const rich = opt('a', { display: { title: 'T', badges: [{ text: 'x' }] } })
        const out = applyOptionFitment([rich], new Map([['a', 'no']]), 'flag', TEXT)
        expect(out[0].display).toMatchObject({ title: 'T', badges: [{ text: 'x' }, { text: 'No compatible', tone: 'warning' }] })
    })
    it('no states → the SAME array (retrocompat)', () => {
        expect(applyOptionFitment(options, new Map(), 'flag', TEXT)).toBe(options)
        expect(applyOptionFitment(options, new Map([['c', 'unknown']]), 'flag', TEXT)).toBe(options)
    })
})

const rules = [
    { id: 'r1', subject_model: 'Vehicle', subject_attrs: JSON.stringify({ make: 'Toyota', model: 'Hilux' }), target_model: 'TireSpec', target_attrs: { w: 265 } },
]
const products = [
    { id: 'p1', 'TireSpec.w': 265 },
    { id: 'p2', 'TireSpec.w': 195 },
    { id: 'p3', name: 'Servicio' },
]

function makeClient(opts: { rules?: unknown[]; vehicle?: unknown } = {}) {
    const get = vi.fn(async (url: string, cfg?: { params?: Record<string, string> }) => {
        if (url === '/data/FitmentRule') return { data: { data: opts.rules ?? rules } }
        if (url === '/data/Vehicle') return { data: { data: [opts.vehicle ?? { id: 'v1', make: 'toyota', model: 'HILUX', year: 2020 }] } }
        if (url === '/data/Product') {
            const ids = String(cfg?.params?.f_id ?? '').replace('in:', '').split(',')
            return { data: { data: products.filter((p) => ids.includes(p.id)) } }
        }
        throw new Error(`unexpected ${url}`)
    })
    return { get }
}

const spec: OptionFitmentSpec = { subject_field: 'vehicle_id', subject_model: 'Vehicle', target_model: 'TireSpec', mode: 'flag' }
const baseOptions = [opt('p1'), opt('p2'), opt('p3')]

describe('useOptionFitment', () => {
    beforeEach(() => vi.useRealTimers())

    it('flags options once the subject, rules and option rows are loaded; unknown product untouched', async () => {
        const client = makeClient()
        const { result } = renderHook(() =>
            useOptionFitment({ spec, subjectId: 'v1', sourceModel: 'Product', options: baseOptions, client }),
        )
        await waitFor(() => expect(result.current.find((o) => o.id === 'p1')?.fit).toBe('fits'))
        expect(result.current.find((o) => o.id === 'p2')?.fit).toBe('no')
        expect(result.current.find((o) => o.id === 'p3')?.fit).toBeUndefined() // no TireSpec attributes: nothing said
    })

    it('inert without a subject: no request, options untouched', async () => {
        const client = makeClient()
        const { result } = renderHook(() =>
            useOptionFitment({ spec, subjectId: '', sourceModel: 'Product', options: baseOptions, client }),
        )
        expect(result.current).toBe(baseOptions)
        expect(client.get).not.toHaveBeenCalled()
    })

    it('inert without a spec (column without option_fitment)', () => {
        const client = makeClient()
        const { result } = renderHook(() =>
            useOptionFitment({ spec: null, subjectId: 'v1', sourceModel: 'Product', options: baseOptions, client }),
        )
        expect(result.current).toBe(baseOptions)
        expect(client.get).not.toHaveBeenCalled()
    })

    it('a vehicle with no rules never flags or hides anything', async () => {
        const client = makeClient({ vehicle: { id: 'v1', make: 'Nissan', model: 'Versa', year: 2020 } })
        const { result } = renderHook(() =>
            useOptionFitment({ spec: { ...spec, mode: 'filter' }, subjectId: 'v1', sourceModel: 'Product', options: baseOptions, client }),
        )
        await waitFor(() => expect(client.get).toHaveBeenCalledWith('/data/Vehicle', expect.anything()))
        await new Promise((r) => setTimeout(r, 30))
        expect(result.current).toBe(baseOptions)
        expect(client.get.mock.calls.some((c) => c[0] === '/data/Product')).toBe(false)
    })

    it('filter mode hides non-fitting options but keeps the selection', async () => {
        const client = makeClient()
        const { result } = renderHook(() =>
            useOptionFitment({ spec: { ...spec, mode: 'filter' }, subjectId: 'v1', sourceModel: 'Product', options: baseOptions, keepValue: 'p2', client }),
        )
        await waitFor(() => expect(result.current.length).toBe(3))
        const { result: r2 } = renderHook(() =>
            useOptionFitment({ spec: { ...spec, mode: 'filter' }, subjectId: 'v1', sourceModel: 'Product', options: baseOptions, client }),
        )
        await waitFor(() => expect(r2.current.map((o) => o.id)).toEqual(['p1', 'p3']))
    })

    it('a failing load leaves the options as they were', async () => {
        const client = { get: vi.fn().mockRejectedValue(new Error('boom')) }
        const { result } = renderHook(() =>
            useOptionFitment({ spec, subjectId: 'v1', sourceModel: 'Product', options: baseOptions, client }),
        )
        await new Promise((r) => setTimeout(r, 30))
        expect(result.current).toBe(baseOptions)
    })

    it('loadTargetRows fetches only the ids not cached yet', async () => {
        const client = makeClient()
        resetOptionFitmentCache(client)
        resetFitmentCache(client)
        await loadTargetRows(client, 'Product', ['p1', 'p2'])
        const m = await loadTargetRows(client, 'Product', ['p1', 'p2', 'p3'])
        const calls = client.get.mock.calls.filter((c) => c[0] === '/data/Product')
        expect(calls).toHaveLength(2)
        expect(String((calls[1][1] as { params: { f_id: string } }).params.f_id)).toBe('in:p3')
        expect([...m.keys()].sort()).toEqual(['p1', 'p2', 'p3'])
    })
})
