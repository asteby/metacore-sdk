import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BRANDING_STYLE_ID,
  THEME_BOOTING_CLASS,
  THEME_BOOT_STORAGE_KEY,
  captureThemeBoot,
  persistThemeBoot,
  themeBootScript,
  watchThemeBoot,
} from './boot'

const root = () => document.documentElement

function resetDocument() {
  const html = root()
  for (const attr of Array.from(html.attributes)) html.removeAttribute(attr.name)
  html.className = ''
  html.removeAttribute('style')
  document.head.innerHTML = ''
  document.cookie = 'metacore-ui-theme=; max-age=0; path=/'
}

function runBoot(options?: Parameters<typeof themeBootScript>[0]) {
  new Function(themeBootScript(options))()
}

function prefersDark(dark: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: dark && q.includes('dark') }))
  window.matchMedia = globalThis.matchMedia
}

// What a returning visitor's providers left on <html>: glass pack, compact,
// Manrope, a brand accent inline and the generated surfaces stylesheet.
function paintResolvedTheme(mode: 'light' | 'dark') {
  const html = root()
  html.classList.add(mode, 'font-manrope')
  html.setAttribute('data-ui-theme', 'glass')
  html.setAttribute('data-ui-density', 'compact')
  html.style.setProperty('--primary', mode === 'dark' ? 'oklch(0.7 0.2 131)' : 'oklch(0.6 0.2 131)')
  html.style.setProperty('--brand-primary', '#84cc16')
  const style = document.createElement('style')
  style.id = BRANDING_STYLE_ID
  style.textContent = `:root { --background: ${mode === 'dark' ? 'oklch(0.22 0.01 131)' : 'oklch(0.99 0 0)'}; }`
  document.head.appendChild(style)
}

describe('theme boot', () => {
  beforeEach(() => {
    localStorage.clear()
    resetDocument()
    prefersDark(false)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('first visit follows prefers-color-scheme', () => {
    prefersDark(true)
    runBoot()
    expect(root().classList.contains('dark')).toBe(true)
    prefersDark(false)
    resetDocument()
    runBoot()
    expect(root().classList.contains('light')).toBe(true)
  })

  it('the user choice cookie wins over the OS', () => {
    document.cookie = 'metacore-ui-theme=dark; path=/'
    runBoot()
    expect(root().classList.contains('dark')).toBe(true)
    expect(root().classList.contains('light')).toBe(false)
  })

  it('restores exactly what the providers painted last time', () => {
    document.cookie = 'metacore-ui-theme=dark; path=/'
    paintResolvedTheme('dark')
    const before = captureThemeBoot()
    expect(persistThemeBoot()).toBe(true)

    resetDocument()
    document.cookie = 'metacore-ui-theme=dark; path=/'
    runBoot()
    expect(captureThemeBoot()).toEqual(before)
  })

  it('does not rewrite storage when nothing changed', () => {
    paintResolvedTheme('light')
    expect(persistThemeBoot()).toBe(true)
    expect(persistThemeBoot()).toBe(false)
  })

  it('keeps the other mode only while the pack is the same', () => {
    paintResolvedTheme('light')
    persistThemeBoot()
    resetDocument()
    paintResolvedTheme('dark')
    persistThemeBoot()
    let stored = JSON.parse(localStorage.getItem(THEME_BOOT_STORAGE_KEY)!)
    expect(Object.keys(stored.modes).sort()).toEqual(['dark', 'light'])

    root().setAttribute('data-ui-theme', 'ocean')
    persistThemeBoot()
    stored = JSON.parse(localStorage.getItem(THEME_BOOT_STORAGE_KEY)!)
    expect(Object.keys(stored.modes)).toEqual(['dark'])
  })

  it('skips mode vars stored for the other mode', () => {
    paintResolvedTheme('light')
    persistThemeBoot()
    resetDocument()
    document.cookie = 'metacore-ui-theme=dark; path=/'
    runBoot()
    expect(root().getAttribute('data-ui-theme')).toBe('glass')
    expect(root().style.getPropertyValue('--primary')).toBe('')
    expect(document.getElementById(BRANDING_STYLE_ID)).toBeNull()
  })

  it('never sets a non data-* attribute or a non custom property from storage', () => {
    localStorage.setItem(
      THEME_BOOT_STORAGE_KEY,
      JSON.stringify({
        v: 1,
        attrs: { onload: 'alert(1)', 'data-ui-theme': 'glass' },
        classes: [],
        modes: { light: { vars: { color: 'red', '--ok': '1' }, styles: {}, base: '' } },
      }),
    )
    runBoot()
    expect(root().hasAttribute('onload')).toBe(false)
    expect(root().getAttribute('data-ui-theme')).toBe('glass')
    expect(root().style.getPropertyValue('color')).toBe('')
    expect(root().style.getPropertyValue('--ok')).toBe('1')
  })

  it('survives a corrupt entry', () => {
    localStorage.setItem(THEME_BOOT_STORAGE_KEY, '{nope')
    expect(() => runBoot()).not.toThrow()
    expect(root().classList.contains('light')).toBe(true)
  })

  it('locks transitions until released, except opted-out elements', () => {
    runBoot({ maxLockMs: 60_000 })
    expect(root().classList.contains(THEME_BOOTING_CLASS)).toBe(true)
    const css = Array.from(document.head.querySelectorAll('style'))
      .map((s) => s.textContent)
      .join('')
    expect(css).toContain('transition:none!important')
    expect(css).toContain(':not([data-boot-transition])')
  })

  it('watchThemeBoot stores provider changes', async () => {
    const stop = watchThemeBoot()
    root().classList.add('dark')
    root().setAttribute('data-ui-theme', 'rose')
    await new Promise((r) => setTimeout(r, 10))
    const stored = JSON.parse(localStorage.getItem(THEME_BOOT_STORAGE_KEY)!)
    expect(stored.attrs['data-ui-theme']).toBe('rose')
    expect(stored.modes.dark).toBeDefined()
    stop()
  })
})
