import { describe, expect, it } from 'vitest'
import { composite, contrastRatio, parseColor } from '@asteby/metacore-theme/contrast'
import { deriveBrandTokens } from '../src/platform-config-provider'

// Deep, mid-tone, bright and achromatic brands: the derivation must hold AA
// for all of them, not only for the defaults.
const BRANDS = ['#102E6B', '#6366f1', '#84cc16', '#e11d48', '#2b2b2b', '#f59e0b', '#0ea5e9', '#7c3aed', '#ffffff', '#000000']

const at = (color: string, alpha: number) => {
  const c = parseColor(color)!
  return { ...c, a: c.a * alpha }
}

describe.each(BRANDS)('deriveBrandTokens(%s)', (brand) => {
  it('dark: primary reads as text on every dark surface, buttons/ring/input hold AA', () => {
    const v = deriveBrandTokens(brand, '#313D4C', 'dark')!
    const card = v['--card']!
    expect(contrastRatio(v['--primary']!, v['--secondary']!)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(v['--primary']!, card)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(v['--sidebar-accent-foreground']!, v['--sidebar-accent']!)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(v['--primary-foreground']!, v['--primary']!)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(v['--accent-foreground']!, v['--accent']!)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(composite(at(v['--ring']!, 0.5), card), card)).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(v['--input']!, card)).toBeGreaterThanOrEqual(3)
  })

  it('light: primary keeps 3:1 on the canvas, its foreground 4.5:1, ring/input 3:1', () => {
    const v = deriveBrandTokens(brand, '#313D4C', 'light')!
    const card = v['--card']!
    expect(contrastRatio(v['--primary']!, card)).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(v['--primary-foreground']!, v['--primary']!)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(v['--accent-foreground']!, v['--accent']!)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(composite(at(v['--ring']!, 0.5), card), card)).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(v['--input']!, card)).toBeGreaterThanOrEqual(3)
  })
})

it('keeps a bright brand bright in light mode (lime stays lime with dark text)', () => {
  const v = deriveBrandTokens('#84cc16', '#000000', 'light')!
  expect(v['--primary']!.startsWith('oklch(0.6')).toBe(true)
  expect(v['--primary-foreground']).toBe('oklch(0.18 0 0)')
})
