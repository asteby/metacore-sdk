import { describe, expect, it } from 'vitest'
import { OPTION_PALETTE, generateBadgeStyles } from './option-colors'

const rgb = (css: string) => css.match(/\d+(\.\d+)?/g)!.slice(0, 4).map(Number)
const lum = ([r, g, b]: number[]) => {
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!)
}
const ratio = (a: number[], b: number[]) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}
/** rgba() background flattened over the surface the badge sits on. */
const flatten = (bg: string, surface: number[]) => {
  const [r, g, b, a] = rgb(bg)
  return [r!, g!, b!].map((v, i) => v * a! + surface[i]! * (1 - a!))
}

describe('generateBadgeStyles', () => {
  // Brand-navy, slate and wine option colors are the ones that vanished on dark cards.
  const colors = [...OPTION_PALETTE, '102E6B', '313D4C', '5D646C', '7f1d1d', 'eab308', 'ffffff', '000000']
  it.each(colors)('%s reads at AA 4.5:1 in light and dark', (hex) => {
    for (const [isDark, surface] of [
      [false, [255, 255, 255]],
      [true, [33, 38, 47]],
    ] as const) {
      const s = generateBadgeStyles(hex, { isDark })
      const bg = flatten(s.backgroundColor as string, [...surface])
      expect(ratio(rgb(s.color as string), bg)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
