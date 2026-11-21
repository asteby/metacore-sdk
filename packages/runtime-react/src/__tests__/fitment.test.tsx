// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import {
    fitFor,
    loadFitmentRules,
    matchesSpec,
    resetFitmentCache,
    rulesForSubject,
    targetsForSubject,
    toFitmentRule,
    useFitment,
    type FitmentRule,
} from '../fitment'

const rule = (over: Partial<FitmentRule>): FitmentRule => ({
    subject_model: 'Vehicle',
    subject_attrs: {},
    target_model: 'TireSpec',
    target_attrs: {},
    ...over,
})

describe('matchesSpec', () => {
    it('scalar: case/trim-insensitive text, numeric equality across string/number', () => {
        expect(matchesSpec('Toyota', ' toyota ')).toBe(true)
        expect(matchesSpec(17, '17')).toBe(true)
        expect(matchesSpec(16.5, '16,5')).toBe(true)
        expect(matchesSpec(17, 18)).toBe(false)
    })
    it('set and range', () => {
        expect(matchesSpec(['a', 'b'], 'B')).toBe(true)
        expect(matchesSpec(['a', 'b'], 'c')).toBe(false)
        expect(matchesSpec({ from: 2016, to: 2023 }, 2016)).toBe(true)
        expect(matchesSpec({ from: 2016, to: 2023 }, 2023)).toBe(true)
        expect(matchesSpec({ from: 2016, to: 2023 }, 2024)).toBe(false)
        expect(matchesSpec({ from: 2016 }, 2030)).toBe(true)
        expect(matchesSpec({ to: 2010 }, 2011)).toBe(false)
    })
    it('refuses blanks and empty ranges instead of matching everything', () => {
        expect(matchesSpec('x', '')).toBe(false)
        expect(matchesSpec('x', null)).toBe(false)
        expect(matchesSpec({}, 2020)).toBe(false)
        expect(matchesSpec({ from: 1 }, 'abc')).toBe(false)
    })
})

const rules: FitmentRule[] = [
    rule({
        subject_attrs: { make: 'Toyota', model: 'Hilux', year: { from: 2016, to: 2023 } },
        target_attrs: { section_width_mm: 265, aspect_ratio: 65, rim_diameter_in: 17 },
    }),
    rule({
        subject_attrs: { make: 'Toyota', model: 'Hilux', year: { from: 2016, to: 2023 } },
        target_attrs: { section_width_mm: 265, aspect_ratio: 60, rim_diameter_in: 18 },
    }),
    rule({ subject_attrs: { make: 'Nissan' }, target_attrs: { section_width_mm: 205 } }),
    rule({ subject_attrs: {}, target_attrs: { section_width_mm: 195 } }), // universal for the model
    rule({ subject_attrs: { make: 'Toyota' }, target_attrs: { section_width_mm: 999 }, is_active: false }),
    rule({ subject_model: 'Printer', subject_attrs: { make: 'Toyota' }, target_model: 'Toner', target_attrs: { sku: 'T1' } }),
]
const hilux = { make: 'toyota', model: 'HILUX', year: 2020 }

describe('rules', () => {
    it('subject match honours range, ignores inactive and other models, includes universal', () => {
        const got = rulesForSubject(rules, 'Vehicle', hilux)
        expect(got).toHaveLength(3) // 2 hilux + universal
        expect(rulesForSubject(rules, 'Vehicle', { ...hilux, year: 2015 })).toHaveLength(1) // only universal
    })
    it('targets are deduped and can be narrowed by target model', () => {
        const dup = [...rules, rules[0]]
        expect(targetsForSubject(dup, 'Vehicle', hilux, 'TireSpec')).toHaveLength(3)
        expect(targetsForSubject(rules, 'Printer', { make: 'Toyota' }, 'TireSpec')).toHaveLength(0)
        expect(targetsForSubject(rules, 'Printer', { make: 'Toyota' }, 'Toner')).toEqual([{ sku: 'T1' }])
    })
    it('fitFor: fits / no / unknown', () => {
        expect(fitFor(rules, 'Vehicle', hilux, 'TireSpec', { section_width_mm: 265, aspect_ratio: 65, rim_diameter_in: 17 })).toBe('fits')
        expect(fitFor(rules, 'Vehicle', hilux, 'TireSpec', { section_width_mm: 275, aspect_ratio: 65, rim_diameter_in: 17 })).toBe('no')
        expect(fitFor(rules, 'Vehicle', hilux, 'TireSpec', { section_width_mm: 195 })).toBe('fits') // universal
        expect(fitFor(rules, 'Vehicle', hilux, 'Wiper', { size: 1 })).toBe('unknown')
        expect(fitFor([], 'Vehicle', hilux, 'TireSpec', {})).toBe('unknown')
        // inactive rule never fits
        expect(fitFor(rules, 'Vehicle', hilux, 'TireSpec', { section_width_mm: 999 })).toBe('no')
    })
    it('target spec may itself be a range or set', () => {
        const r = [rule({ subject_attrs: { make: 'A' }, target_attrs: { rim_diameter_in: { from: 15, to: 17 }, speed: ['H', 'V'] } })]
        expect(fitFor(r, 'Vehicle', { make: 'A' }, 'TireSpec', { rim_diameter_in: '16', speed: 'v' })).toBe('fits')
        expect(fitFor(r, 'Vehicle', { make: 'A' }, 'TireSpec', { rim_diameter_in: 18, speed: 'v' })).toBe('no')
        expect(fitFor(r, 'Vehicle', { make: 'A' }, 'TireSpec', { speed: 'v' })).toBe('no') // missing attr is not a fit
    })
    it('fitFor accepts a raw list row: extension columns "Model.col" and variant attributes', () => {
        const r = [rule({ subject_attrs: { make: 'A' }, target_attrs: { section_width_mm: 205, rim_diameter_in: 16 } })]
        const product = { id: 'p1', name: 'x', 'TireSpec.section_width_mm': 205, 'TireSpec.rim_diameter_in': '16' }
        expect(fitFor(r, 'Vehicle', { make: 'A' }, 'TireSpec', product)).toBe('fits')
        expect(fitFor(r, 'Vehicle', { make: 'A' }, 'TireSpec', { 'Other.section_width_mm': 205 })).toBe('no')
        const variant = { attributes: '{"section_width_mm":"205","rim_diameter_in":16}' }
        expect(fitFor(r, 'Vehicle', { make: 'A' }, 'TireSpec', variant)).toBe('fits')
    })
    it('a target with none of the constrained attributes is unknown, not "no"', () => {
        const r = [rule({ subject_attrs: { make: 'A' }, target_attrs: { section_width_mm: 205 } })]
        expect(fitFor(r, 'Vehicle', { make: 'A' }, 'TireSpec', { id: 'svc', name: 'Alineación' })).toBe('unknown')
        expect(fitFor(r, 'Vehicle', { make: 'A' }, 'TireSpec', { 'TireSpec.section_width_mm': null })).toBe('unknown')
    })
    it('toFitmentRule parses jsonb strings and defaults', () => {
        const r = toFitmentRule({ id: 1, subject_model: 'Vehicle', subject_attrs: '{"make":"x"}', target_model: 'T', target_attrs: 'garbage' })
        expect(r).toMatchObject({ id: '1', subject_attrs: { make: 'x' }, target_attrs: {}, is_active: true })
    })
})

const row = (r: FitmentRule) => ({ ...r, subject_attrs: JSON.stringify(r.subject_attrs), target_attrs: r.target_attrs })

describe('loadFitmentRules / useFitment', () => {
    beforeEach(() => vi.useRealTimers())

    it('pages until a short page, dedupes concurrent calls and caches per client', async () => {
        const full = Array.from({ length: 200 }, (_, i) => row(rule({ id: String(i) })))
        const get = vi
            .fn()
            .mockResolvedValueOnce({ data: { data: full } })
            .mockResolvedValueOnce({ data: { data: { items: [row(rules[0])] } } })
        const client = { get }
        const [a, b] = await Promise.all([loadFitmentRules(client, 'Vehicle'), loadFitmentRules(client, 'Vehicle')])
        expect(a).toHaveLength(201)
        expect(b).toBe(a)
        expect(get).toHaveBeenCalledTimes(2)
        expect(get.mock.calls[0]).toEqual(['/data/FitmentRule', { params: { f_subject_model: 'eq:Vehicle', f_is_active: 'eq:true', per_page: 200, page: 1 } }])
        await loadFitmentRules(client, 'Vehicle')
        expect(get).toHaveBeenCalledTimes(2) // cached
        resetFitmentCache(client)
        get.mockResolvedValue({ data: { data: [] } })
        await loadFitmentRules(client, 'Vehicle')
        expect(get).toHaveBeenCalledTimes(3)
    })

    it('hook resolves targets and fit for a subject; unknown while nothing is selected', async () => {
        const client = { get: vi.fn().mockResolvedValue({ data: { data: rules.map(row) } }) }
        const { result, rerender } = renderHook(
            ({ subject }: { subject: Record<string, unknown> | null }) =>
                useFitment({ client, subject, targetModel: 'TireSpec' }),
            { initialProps: { subject: null as Record<string, unknown> | null } },
        )
        expect(result.current.hasRules).toBe(false)
        expect(result.current.fit({ section_width_mm: 265 })).toBe('unknown')
        expect(client.get).not.toHaveBeenCalled()
        rerender({ subject: hilux })
        await waitFor(() => expect(result.current.hasRules).toBe(true))
        expect(result.current.targets).toHaveLength(3)
        expect(result.current.fit({ section_width_mm: 265, aspect_ratio: 65, rim_diameter_in: 17 })).toBe('fits')
        expect(result.current.fit({ section_width_mm: 1 })).toBe('no')
    })

    it('surfaces a load error and stays unknown', async () => {
        const client = { get: vi.fn().mockRejectedValue(new Error('boom')) }
        resetFitmentCache(client)
        const { result } = renderHook(() => useFitment({ client, subject: hilux, targetModel: 'TireSpec' }))
        await waitFor(() => expect(result.current.error?.message).toBe('boom'))
        expect(result.current.fit({ a: 1 })).toBe('unknown')
    })
})
