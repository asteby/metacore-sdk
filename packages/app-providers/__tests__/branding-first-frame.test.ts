import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applyCachedBranding,
  persistBranding,
  readWindowBranding,
  sanitizeBranding,
} from '../src/platform-config-provider'

// Minimal fake DOM (the suite runs in the node environment).
function installFakeDom() {
  const styleProps = new Map<string, string>()
  const classes = new Set<string>()
  const head: Array<{ id: string; textContent: string }> = []
  const store = new Map<string, string>()
  const root = {
    classList: { contains: (c: string) => classes.has(c), add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) },
    style: {
      getPropertyValue: (k: string) => styleProps.get(k) ?? '',
      setProperty: (k: string, v: string) => void styleProps.set(k, v),
      removeProperty: (k: string) => void styleProps.delete(k),
    },
  }
  const doc = {
    title: '',
    documentElement: root,
    head: { appendChild: (el: { id: string; textContent: string }) => void head.push(el) },
    createElement: () => ({ id: '', textContent: '' }),
    getElementById: (id: string) => head.find((e) => e.id === id) ?? null,
  }
  const localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
  }
  const win: Record<string, unknown> = { localStorage }
  Object.assign(globalThis, { window: win, document: doc })
  return { win, store, styleProps, classes, head, doc }
}

const KEY = 'platform-branding:ops.example.com'
let dom: ReturnType<typeof installFakeDom>

beforeEach(() => {
  dom = installFakeDom()
})
afterEach(() => {
  delete (globalThis as Record<string, unknown>).window
  delete (globalThis as Record<string, unknown>).document
})

describe('sanitizeBranding', () => {
  it('keeps only #RRGGBB colors and string fields', () => {
    expect(
      sanitizeBranding({
        primary_color: 'red;background:url(x)',
        accent_color: ' #AABBCC ',
        platform_name: 'God',
        junk: { a: 1 },
        agent_suggestions: ['a', 3],
      }),
    ).toEqual({ accent_color: '#AABBCC', platform_name: 'God', agent_suggestions: ['a'] })
  })
  it('rejects non-objects', () => {
    expect(sanitizeBranding(null)).toBeUndefined()
    expect(sanitizeBranding('x')).toBeUndefined()
    expect(sanitizeBranding([1])).toBeUndefined()
  })
})

describe('persistBranding replaces, never merges', () => {
  it('drops fields the new response no longer has', () => {
    dom.store.set(KEY, JSON.stringify({ primary_color: '#111111', platform_name: 'Viejo', platform_logo: '/old.png' }))
    persistBranding({ primary_color: '#222222', platform_name: 'Nuevo' }, KEY)
    expect(JSON.parse(dom.store.get(KEY)!)).toEqual({ primary_color: '#222222', platform_name: 'Nuevo' })
  })
})

describe('applyCachedBranding: __BRAND__ over stored', () => {
  it('prefers window.__BRAND__, paints it and rewrites the key', () => {
    dom.store.set(KEY, JSON.stringify({ primary_color: '#111111', accent_color: '#111111', platform_logo: '/old.png' }))
    dom.win.__BRAND__ = { primary_color: '#22aa44', accent_color: '#3344ff', platform_name: 'God' }
    applyCachedBranding(KEY)
    expect(dom.styleProps.get('--brand-primary')).toBe('#22aa44')
    expect(dom.doc.title).toBe('God')
    expect(JSON.parse(dom.store.get(KEY)!)).toEqual({
      primary_color: '#22aa44',
      accent_color: '#3344ff',
      platform_name: 'God',
    })
  })

  it('uses the stored value only when there is no __BRAND__ (offline)', () => {
    dom.store.set(KEY, JSON.stringify({ primary_color: '#111111', accent_color: '#222222' }))
    const before = dom.store.get(KEY)
    applyCachedBranding(KEY)
    expect(dom.styleProps.get('--brand-primary')).toBe('#111111')
    expect(dom.store.get(KEY)).toBe(before)
  })

  it('a hostile __BRAND__ color is never painted or stored', () => {
    dom.win.__BRAND__ = { primary_color: 'red;}body{display:none', accent_color: 'url(x)' }
    applyCachedBranding(KEY)
    expect(dom.styleProps.get('--brand-primary')).not.toContain('red')
    expect(JSON.parse(dom.store.get(KEY)!)).toEqual({})
    for (const v of dom.styleProps.values()) expect(v).not.toMatch(/display|url\(/)
    for (const e of dom.head) expect(e.textContent).not.toMatch(/display:none|url\(/)
  })

  it('a hostile stored value is sanitized too', () => {
    dom.store.set(KEY, JSON.stringify({ primary_color: 'expression(alert(1))', accent_color: '#123456' }))
    applyCachedBranding(KEY)
    expect(dom.styleProps.get('--brand-accent')).toBe('#123456')
    for (const v of dom.styleProps.values()) expect(v).not.toContain('expression')
  })

  it('corrupt storage does not throw', () => {
    dom.store.set(KEY, '{not json')
    expect(() => applyCachedBranding(KEY)).not.toThrow()
    expect(readWindowBranding()).toBeUndefined()
  })
})

describe('applyBranding with a product theme', () => {
  it('exposes the gradient and foreground; absent theme changes nothing', async () => {
    const { applyBranding } = await import('../src/platform-config-provider')
    applyBranding({ primary_color: '#0033f0', accent_color: '#00fcff' })
    expect(dom.styleProps.has('--brand-gradient')).toBe(false)
    const plain = dom.styleProps.get('--primary')

    applyBranding(
      { primary_color: '#0033f0', accent_color: '#00fcff' },
      undefined,
      { gradient: ['#00fcff', '#0033f0'], foreground: '#020846' },
    )
    expect(dom.styleProps.get('--brand-gradient')).toBe('linear-gradient(135deg, #00fcff, #0033f0)')
    expect(dom.styleProps.get('--brand-foreground')).toBe('#020846')
    expect(dom.styleProps.get('--primary')).toBe(plain)
  })

  it('uses theme.dark.primary as the dark-mode seed instead of deriving it', async () => {
    const { applyBranding } = await import('../src/platform-config-provider')
    dom.classes.add('dark')
    applyBranding({ primary_color: '#0033f0', accent_color: '#00fcff' })
    const derived = dom.styleProps.get('--primary')
    applyBranding({ primary_color: '#0033f0', accent_color: '#00fcff' }, undefined, { dark: { primary: '#00fcff' } })
    expect(dom.styleProps.get('--primary')).not.toBe(derived)
  })
})
