import { describe, expect, it } from 'vitest'
import { formatDuration } from '../format'

describe('formatDuration', () => {
  it('uses at most two units, es-MX by default', () => {
    expect(formatDuration(45)).toBe('45 s')
    expect(formatDuration(12 * 60)).toBe('12 min')
    expect(formatDuration(3 * 3600 + 20 * 60)).toBe('3 h 20 min')
    expect(formatDuration(2 * 3600)).toBe('2 h')
    expect(formatDuration(2 * 86400 + 5 * 3600)).toBe('2 días 5 h')
  })

  it('localizes units', () => {
    expect(formatDuration(3 * 3600 + 20 * 60, { locale: 'en-US' })).toBe('3 hr 20 min')
  })

  it('returns the invalid marker for bad input', () => {
    expect(formatDuration(-1)).toBe('—')
    expect(formatDuration(Number.NaN, { invalid: 'n/d' })).toBe('n/d')
  })
})
