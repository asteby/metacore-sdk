import { describe, expect, it } from 'vitest'
import {
    effectiveStatus,
    flowProgress,
    mergeAnswer,
    nextPollDelayMs,
    normalizeState,
    pickActiveStep,
    safeUrl,
    unmetDependencies,
} from '../setup/flow-model'
import type { SetupStepDef, SetupStepState } from '../setup/types'

const defs: SetupStepDef[] = [
    { key: 'domain', kind: 'form', title: 'Domain' },
    { key: 'dns', kind: 'records', title: 'DNS', depends_on: ['domain'] },
    { key: 'test', kind: 'action', title: 'Test', depends_on: ['dns'] },
    { key: 'extras', kind: 'action', title: 'Extras', optional: true },
]
const st = (key: string, status: SetupStepState['status'], extra: Partial<SetupStepState> = {}): SetupStepState => ({ key, status, ...extra })
const map = (...s: SetupStepState[]) => Object.fromEntries(s.map((x) => [x.key, x]))

describe('normalizeState', () => {
    it('accepts array and by-key map', () => {
        expect(normalizeState({ steps: [st('a', 'ok')] }).a.status).toBe('ok')
        expect(normalizeState({ steps: { a: { status: 'warn' } as SetupStepState } }).a).toMatchObject({ key: 'a', status: 'warn' })
        expect(normalizeState(undefined)).toEqual({})
    })
})

describe('effectiveStatus / depends_on', () => {
    it('blocks a step whose dependency is not satisfied', () => {
        const s = map(st('domain', 'pending'))
        expect(effectiveStatus(defs[1], s)).toBe('blocked')
        expect(unmetDependencies(defs[1], s)).toEqual(['domain'])
    })
    it('unblocks when the dependency is ok, warn or skipped', () => {
        expect(effectiveStatus(defs[1], map(st('domain', 'ok')))).toBe('pending')
        expect(effectiveStatus(defs[1], map(st('domain', 'warn')))).toBe('pending')
        expect(effectiveStatus(defs[1], map(st('domain', 'pending', { skipped: true })))).toBe('pending')
    })
    it('an error dependency keeps dependants blocked', () => {
        expect(effectiveStatus(defs[1], map(st('domain', 'error')))).toBe('blocked')
    })
    it('keeps running/ok from the server and reads skipped as ok', () => {
        expect(effectiveStatus(defs[1], map(st('dns', 'running')))).toBe('running')
        expect(effectiveStatus(defs[3], map(st('extras', 'pending', { skipped: true })))).toBe('ok')
    })
})

describe('pickActiveStep / flowProgress', () => {
    it('resumes at the first step that is not satisfied and not blocked', () => {
        expect(pickActiveStep(defs, map(st('domain', 'ok'), st('dns', 'error')))).toBe('dns')
        expect(pickActiveStep(defs, map())).toBe('domain')
    })
    it('falls to the last step when everything is satisfied', () => {
        expect(pickActiveStep(defs, map(st('domain', 'ok'), st('dns', 'ok'), st('test', 'ok'), st('extras', 'ok')))).toBe('extras')
    })
    it('optional steps do not hold completion back', () => {
        const p = flowProgress(defs, map(st('domain', 'ok'), st('dns', 'ok'), st('test', 'ok')))
        expect(p).toEqual({ done: 3, total: 3, percent: 100, complete: true })
    })
    it('an error step is not progress', () => {
        const p = flowProgress(defs, map(st('domain', 'ok'), st('dns', 'error')))
        expect(p.complete).toBe(false)
        expect(p.done).toBe(1)
    })
    it('honours the server verdict', () => {
        expect(flowProgress(defs, {}, true)).toMatchObject({ complete: true, percent: 100 })
    })
})

describe('nextPollDelayMs', () => {
    it('backs off exponentially up to the cap', () => {
        expect(nextPollDelayMs(0)).toBe(2000)
        expect(nextPollDelayMs(1)).toBe(3200)
        expect(nextPollDelayMs(2)).toBe(5120)
        expect(nextPollDelayMs(50)).toBe(30000)
    })
    it('retry_after_s wins, clamped to 1s..5min', () => {
        expect(nextPollDelayMs(5, 45)).toBe(45000)
        expect(nextPollDelayMs(0, 0.1)).toBe(1000) // floor 1s
        expect(nextPollDelayMs(0, -3)).toBe(2000) // unusable hint → backoff
        expect(nextPollDelayMs(0, 1)).toBe(1000)
        expect(nextPollDelayMs(0, 99999)).toBe(300000)
    })
})

describe('safeUrl', () => {
    it('allows http(s) and app-relative, refuses the rest', () => {
        expect(safeUrl('/settings')).toBe('/settings')
        expect(safeUrl('https://x.test/a')).toBe('https://x.test/a')
        expect(safeUrl('javascript:alert(1)')).toBeNull()
        expect(safeUrl('//evil.test')).toBeNull()
        expect(safeUrl('data:text/html,hi')).toBeNull()
    })
})

describe('mergeAnswer', () => {
    it('merges a step answer, replaces on a flow answer, refetches on void', () => {
        const cur = map(st('a', 'pending'))
        expect(mergeAnswer(cur, 'a', st('a', 'ok')).next.a.status).toBe('ok')
        expect(mergeAnswer(cur, 'a', { steps: [st('b', 'ok')] }).next).toEqual({ b: st('b', 'ok') })
        expect(mergeAnswer(cur, 'a', undefined).needsRefetch).toBe(true)
    })
})
