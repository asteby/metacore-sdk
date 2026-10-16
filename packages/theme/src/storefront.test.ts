import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  ctaInk,
  ctaSolid,
  isHex,
  normalizeHex,
  paletteCss,
  readableOn,
  themeCss,
  type ThemeLike,
} from './storefront.js'

describe('storefront contrast (WCAG AA)', () => {
  it('normalizes and detects hex', () => {
    expect(isHex('#0F766E')).toBe(true)
    expect(normalizeHex('#abc')).toBe('#aabbcc')
  })

  it('white on teal button reaches large-text threshold', () => {
    expect(contrastRatio('#ffffff', '#0F766E')).toBeGreaterThanOrEqual(3)
    expect(readableOn('#0F766E')).toBe('#ffffff')
  })

  it('ctaInk reaches 4.5:1 on light surface', () => {
    const ink = ctaInk('#F59E0B', 'light')
    expect(contrastRatio(ink, '#ebe9e4')).toBeGreaterThanOrEqual(4.5)
  })

  it('ctaSolid keeps readableOn at AA for buttons', () => {
    const solid = ctaSolid('#F59E0B')
    const fg = readableOn(solid)
    expect(contrastRatio(fg, solid)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('themeCss / paletteCss', () => {
  const theme: ThemeLike = {
    primary_color: '#0F766E',
    accent_color: '#F59E0B',
    radius: 'md',
    font_display: 'sora',
    font_body: 'manrope',
    header_variant: 'minimal',
    button_shape: 'rounded',
    palette_light: { background: '#ffffff', cta: '#0F766E' },
  }

  it('emits radius, fonts, variants and palette', () => {
    const css = themeCss(theme)
    expect(css).toContain('--radius:.75rem')
    expect(css).toContain('Sora')
    expect(css).toContain('Manrope')
    expect(css).toContain('site-header')
    expect(css).toContain('--background:#ffffff')
    expect(paletteCss(theme)).toContain('--cta-ink:')
  })

  it('empty theme yields empty css', () => {
    expect(themeCss(null)).toBe('')
    expect(paletteCss(undefined)).toBe('')
  })
})
