import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  UI_THEME_PACKS,
  applyCachedUiTheme,
  applyUiTheme,
  getThemePack,
  paintLiveDesign,
  setUiThemeBrandPainter,
} from './ui-theme.js'

describe('ui themes', () => {
  beforeEach(() => {
    localStorage.clear()
    for (const a of ['data-ui-theme', 'data-ui-font', 'data-ui-density', 'data-ui-radius']) document.documentElement.removeAttribute(a)
    setUiThemeBrandPainter(null)
  })

  it('ships glass and the other packs with unique keys', () => {
    const keys = UI_THEME_PACKS.map((p) => p.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toContain('glass')
    expect(getThemePack('glass')?.suggestedPrimary).toBeTruthy()
  })

  it('sets the data-ui-* attributes and persists them', () => {
    applyUiTheme({ theme_key: 'glass', font: 'manrope', density: 'compact', radius: 'lg' })
    const r = document.documentElement
    expect(r.getAttribute('data-ui-theme')).toBe('glass')
    expect(r.getAttribute('data-ui-density')).toBe('compact')
    expect(r.getAttribute('data-ui-radius')).toBe('lg')
    applyUiTheme({ theme_key: 'glass', font: 'manrope', density: 'compact' })
    expect(r.hasAttribute('data-ui-radius')).toBe(false)
  })

  it('restores the cached theme', () => {
    applyUiTheme({ theme_key: 'ocean', font: 'plus_jakarta', density: 'comfortable' })
    document.documentElement.removeAttribute('data-ui-theme')
    applyCachedUiTheme()
    expect(document.documentElement.getAttribute('data-ui-theme')).toBe('ocean')
  })

  it('paints the brand only through the registered painter', () => {
    const painter = vi.fn()
    paintLiveDesign({ theme_key: 'glass', font: 'inter', density: 'comfortable', primary: '#112233' })
    expect(painter).not.toHaveBeenCalled()
    setUiThemeBrandPainter(painter)
    paintLiveDesign({ theme_key: 'glass', font: 'inter', density: 'comfortable', primary: '#112233' })
    expect(painter).toHaveBeenCalledWith({ primary_color: '#112233', accent_color: '#112233' })
  })
})
