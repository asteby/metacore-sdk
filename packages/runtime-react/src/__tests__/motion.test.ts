// @vitest-environment happy-dom
import { describe, expect, it, afterEach, vi } from 'vitest'
import { motionDuration, motionEasing, MOTION_DEFAULTS } from '../motion'

afterEach(() => {
  document.documentElement.style.cssText = ''
  vi.restoreAllMocks()
})

describe('motion tokens', () => {
  it('falls back to the theme defaults when the host defines no variables', () => {
    expect(motionDuration('moderate')).toBe(MOTION_DEFAULTS.duration.moderate)
    expect(motionEasing('standard')).toBe(MOTION_DEFAULTS.easing.standard)
  })

  it('reads the host theme variables (ms and s)', () => {
    document.documentElement.style.setProperty('--motion-duration-moderate', '0.3s')
    document.documentElement.style.setProperty('--motion-duration-fast', '90ms')
    document.documentElement.style.setProperty('--motion-ease-standard', 'linear')
    expect(motionDuration('moderate')).toBe(300)
    expect(motionDuration('fast')).toBe(90)
    expect(motionEasing('standard')).toBe('linear')
  })

  it('is zero under prefers-reduced-motion', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    expect(motionDuration('slow')).toBe(0)
  })
})
