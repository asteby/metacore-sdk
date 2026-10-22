import { describe, expect, it, vi } from 'vitest'
import { intervalFor, pollUntil } from './polling'
import { initialWizardState, sanitizeResume, wizardReducer } from './wizard-state'

describe('intervalFor', () => {
  it('supports constants, backoff arrays (last repeats) and functions', () => {
    expect(intervalFor(5, 3)).toBe(5)
    expect(intervalFor([30, 300, 3600], 0)).toBe(30)
    expect(intervalFor([30, 300, 3600], 9)).toBe(3600)
    expect(intervalFor((n) => n * 2, 4)).toBe(8)
  })
})

describe('pollUntil', () => {
  const noWait = () => Promise.resolve()
  it('stops as soon as the condition holds and reports attempts', async () => {
    const seq = ['missing', 'propagating', 'ok']
    const waits: number[] = []
    const r = await pollUntil(async (i) => seq[i]!, { interval: [10, 20], until: (v) => v === 'ok', sleep: async (ms) => void waits.push(ms) })
    expect(r).toEqual({ status: 'done', value: 'ok', attempts: 3 })
    expect(waits).toEqual([10, 20])
  })
  it('exhausts after maxAttempts keeping the last value', async () => {
    const r = await pollUntil(async () => 'pending', { interval: 1, maxAttempts: 3, until: () => false, sleep: noWait })
    expect(r).toEqual({ status: 'exhausted', value: 'pending', attempts: 3 })
  })
  it('aborts mid-flight', async () => {
    const ac = new AbortController()
    const check = vi.fn(async () => {
      ac.abort()
      return 1
    })
    const r = await pollUntil(check, { interval: 1, until: () => false, signal: ac.signal, sleep: noWait })
    expect(r.status).toBe('aborted')
    expect(check).toHaveBeenCalledTimes(1)
  })
  it('propagates check errors', async () => {
    await expect(pollUntil(async () => { throw new Error('dns down') }, { interval: 1, until: () => true })).rejects.toThrow('dns down')
  })
})

describe('wizard state', () => {
  it('walks start -> finish and clamps goto', () => {
    let s = initialWizardState(['a', 'b'])
    s = wizardReducer(s, { type: 'start', id: 'a' })
    expect(s.steps.a!.status).toBe('running')
    s = wizardReducer(s, { type: 'finish', id: 'a', status: 'error', diagnostic: 'x' })
    expect(s.steps.a).toMatchObject({ status: 'error', diagnostic: 'x' })
    expect(wizardReducer(s, { type: 'goto', index: 99 }).current).toBe(1)
    expect(wizardReducer(s, { type: 'goto', index: -4 }).current).toBe(0)
  })
  it('sanitizes a resumed state: running -> pending, unknown ids dropped, junk tolerated', () => {
    const r = sanitizeResume({ current: 7, steps: { a: { status: 'ok', attempts: 9 }, b: { status: 'running', attempts: 2 }, zzz: { status: 'ok', attempts: 0 } } }, ['a', 'b', 'c'])
    expect(r.current).toBe(2)
    expect(r.steps).toEqual({ a: { status: 'ok', attempts: 0 }, b: { status: 'pending', attempts: 0 }, c: { status: 'pending', attempts: 0 } })
    expect(sanitizeResume('garbage', ['a'])).toEqual(initialWizardState(['a']))
  })
})
