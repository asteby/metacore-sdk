import { describe, expect, it } from 'vitest'
import { composite, contrastRatio, ensureContrast, flatten, mostReadable, parseColor, rgbToOklch, toHex } from './contrast.js'

describe('contrast helpers', () => {
  it('matches the WCAG reference ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
    expect(contrastRatio('#ffffff', '#102E6B')).toBeCloseTo(12.92, 1)
  })

  it('parses oklch (numbers and percentages, with alpha), hex and rgb', () => {
    expect(toHex(parseColor('oklch(1 0 0)')!)).toBe('#ffffff')
    expect(toHex(parseColor('oklch(0% 0 0)')!)).toBe('#000000')
    expect(parseColor('oklch(27% .03 255/.45)')!.a).toBeCloseTo(0.45)
    const navy = parseColor('#102E6B')!
    const [l, c, h] = rgbToOklch(navy.r, navy.g, navy.b)
    expect(toHex(parseColor(`oklch(${l} ${c} ${h})`)!)).toBe('#102e6b')
    expect(parseColor('rgb(16, 46, 107)')).toEqual(parseColor('#102E6B'))
    expect(parseColor('var(--x)')).toBeNull()
  })

  it('composites translucent layers before measuring', () => {
    const half = composite('oklch(1 0 0 / 0.5)', '#000000')
    expect(half.r).toBeCloseTo(0.5, 5)
    expect(half.a).toBe(1)
    expect(flatten('#000000', 'oklch(1 0 0 / 0.5)').a).toBe(1)
    expect(() => contrastRatio('#fff', 'oklch(0 0 0 / 0.5)')).toThrow()
  })

  it('ensureContrast moves lightness away from the background until it passes', () => {
    const lifted = ensureContrast('#102E6B', '#14202d', 4.5)
    expect(contrastRatio(lifted, '#14202d')).toBeGreaterThanOrEqual(4.5)
    const darkened = ensureContrast('#84cc16', '#ffffff', 4.5)
    expect(contrastRatio(darkened, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('mostReadable picks the higher-contrast candidate', () => {
    expect(mostReadable('#102E6B', ['#000000', '#ffffff'])).toBe('#ffffff')
    expect(mostReadable('#D8DBDF', ['#000000', '#ffffff'])).toBe('#000000')
  })
})
