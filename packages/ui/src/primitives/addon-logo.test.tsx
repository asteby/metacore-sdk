import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AddonLogo, ADDON_LOGO_METRICS, safeLogoSrc, monogramOf, fallbackColor } from './addon-logo'

describe('AddonLogo', () => {
  it('fills the padded box with object-contain and never uses a layout-eating border', () => {
    const html = renderToStaticMarkup(<AddonLogo src='https://hub.asteby.com/v1/addons/x/icon.svg' name='X' size='card' />)
    expect(html).toContain('object-contain')
    expect(html).toContain('size-full')
    expect(html).toContain('box-border')
    expect(html).not.toMatch(/(^|[ "])border([ "]|$)/)
    expect(html).not.toMatch(/<img[^>]*(width|height)=/)
    expect(html).toContain('width:44px')
    expect(html).toContain('padding:6px')
  })
  it('keeps a white tile in dark mode too', () => {
    expect(renderToStaticMarkup(<AddonLogo src='/a.png' />)).toContain('bg-white')
  })
  it('rejects unsafe sources and falls back to a monogram', () => {
    expect(safeLogoSrc('javascript:alert(1)')).toBeUndefined()
    expect(safeLogoSrc('//evil.com/a.svg')).toBeUndefined()
    const html = renderToStaticMarkup(<AddonLogo src='javascript:x' name='Mercado Pago' />)
    expect(html).toContain('MP')
    expect(html).not.toContain('<img')
  })
  it('helpers + metrics', () => {
    expect(monogramOf('skydropx')).toBe('SK')
    expect(fallbackColor('#ffff00')).toBe('#404040')
    const { tile, pad } = ADDON_LOGO_METRICS.modal
    expect(tile - 2 * pad).toBeGreaterThan(0)
  })
})
