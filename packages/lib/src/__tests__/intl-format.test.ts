import { describe, expect, it } from 'vitest'
import { compareVersions, formatAmount, formatBytes, formatLocalizedDate, relativeTime } from '../intl-format'

const nb = (s: string) => s.replace(/ | /g, ' ')

describe('formatAmount', () => {
  it('uses currency minor units (0, 2, 3 decimals)', () => {
    expect(nb(formatAmount(1234, { currency: 'JPY', locale: 'en-US' }))).toBe('¥1,234')
    expect(nb(formatAmount(1234.5, { currency: 'USD', locale: 'en-US' }))).toBe('$1,234.50')
    expect(nb(formatAmount(1.5, { currency: 'KWD', locale: 'en-US' }))).toContain('1.500')
  })
  it('without currency prints a plain number, no symbol', () => {
    expect(formatAmount(1234.5, { locale: 'en-US' })).toBe('1,234.50')
    expect(formatAmount(10, { currency: '', locale: 'en-US' })).toBe('10.00')
    expect(formatAmount(10, { currency: null, locale: 'en-US' })).not.toMatch(/[$€¥]/)
  })
  it('unknown code and bad amounts', () => {
    expect(formatAmount(5, { currency: 'ZZZZ', locale: 'en-US' })).toBe('5 ZZZZ')
    expect(formatAmount('abc')).toBe('')
    expect(formatAmount(null)).toBe('')
    expect(formatAmount('12.5', { locale: 'en-US', fractionDigits: 1 })).toBe('12.5')
  })
  it('honours display option', () => {
    expect(nb(formatAmount(1, { currency: 'USD', locale: 'en-US', display: 'code' }))).toBe('USD 1.00')
  })
})

describe('formatLocalizedDate', () => {
  it('keeps calendar dates stable in any zone', () => {
    expect(formatLocalizedDate('2026-09-29', { locale: 'en-US', timeZone: 'America/Los_Angeles' })).toBe('Sep 29, 2026')
  })
  it('formats instants in the given zone, with optional time', () => {
    const out = formatLocalizedDate('2026-09-29T02:05:00Z', { locale: 'en-US', timeZone: 'UTC', time: true })
    expect(nb(out)).toBe('Sep 29, 2026, 2:05 AM')
  })
  it('invalid -> empty', () => {
    expect(formatLocalizedDate('nope')).toBe('')
    expect(formatLocalizedDate(null)).toBe('')
  })
})

describe('relativeTime', () => {
  const now = new Date('2026-01-10T12:00:00Z')
  it('picks the largest fitting unit', () => {
    expect(relativeTime('2026-01-10T09:00:00Z', { locale: 'en', now })).toBe('3 hours ago')
    expect(relativeTime('2026-01-12T12:00:00Z', { locale: 'en', now })).toBe('in 2 days')
    expect(relativeTime('2026-01-09T12:00:00Z', { locale: 'en', now })).toBe('yesterday')
    expect(relativeTime('2026-01-09T12:00:00Z', { locale: 'es', now })).toBe('ayer')
  })
  it('invalid -> empty', () => expect(relativeTime('x', { now })).toBe(''))
})

describe('formatBytes', () => {
  it('formats', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(150 * 1024)).toBe('150 KB')
  })
  it('invalid', () => {
    expect(formatBytes(-1)).toBe('—')
    expect(formatBytes(undefined, { invalid: '' })).toBe('')
  })
})

describe('compareVersions', () => {
  it('orders versions', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
    expect(compareVersions('v1.10.0', '1.9.9')).toBe(1)
    expect(compareVersions('1.0', '1.0.1')).toBe(-1)
    expect(compareVersions('1.0.0-rc.1', '1.0.0')).toBe(-1)
    expect(compareVersions('1.0.0-rc.2', '1.0.0-rc.10')).toBe(-1)
    expect(compareVersions('1.0.0-alpha', '1.0.0-1')).toBe(1)
    expect(compareVersions('1.0.0+b1', '1.0.0+b2')).toBe(0)
    expect(compareVersions('garbage', '0.0.1')).toBe(-1)
  })
})
