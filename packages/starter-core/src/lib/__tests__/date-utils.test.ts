import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectTimezone, getAllTimezones } from '../date-utils'

afterEach(() => vi.restoreAllMocks())

describe('timezone detection', () => {
  it('returns the browser zone', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      resolvedOptions: () => ({ timeZone: 'Asia/Kolkata' }),
    } as unknown as Intl.DateTimeFormat)
    expect(detectTimezone()).toBe('Asia/Kolkata')
  })

  it('returns empty, not a country, when detection throws', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('x')
    })
    expect(detectTimezone()).toBe('')
  })

  it('fallback list (no Intl.supportedValuesOf) has no country bias', () => {
    const orig = (Intl as any).supportedValuesOf
    ;(Intl as any).supportedValuesOf = undefined
    try {
      const values = getAllTimezones().map((z) => z.value)
      expect(values).toContain('UTC')
      expect(values).not.toContain('America/Mexico_City')
    } finally {
      ;(Intl as any).supportedValuesOf = orig
    }
  })
})
