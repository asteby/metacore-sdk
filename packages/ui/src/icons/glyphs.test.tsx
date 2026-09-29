/**
 * @vitest-environment happy-dom
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SHOPPING_CART = [
  ['circle', { cx: '8', cy: '21', r: '1', key: 'a' }],
  ['path', { d: 'M2 2h2l3 12h11', key: 'b' }],
]

async function freshRegistry() {
  vi.resetModules()
  return import('./glyphs')
}

function mount(node: React.ReactNode) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => root.render(node))
  return { host, root }
}

describe('Glyph', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
  })

  it('draws a stored glyph in the first render, with no placeholder', async () => {
    localStorage.setItem('mc:ui:glyphs:v1', JSON.stringify({ 'shopping-cart': SHOPPING_CART }))
    const { Glyph } = await freshRegistry()
    const { host } = mount(<Glyph name="ShoppingCart" className="mr-2 h-4 w-4" />)
    const svg = host.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg!.getAttribute('class')).toContain('h-4 w-4')
    expect(host.querySelector('[data-glyph-pending]')).toBeNull()
  })

  it('holds the icon box while an unseen glyph loads', async () => {
    const { Glyph } = await freshRegistry()
    const { host } = mount(<Glyph name="ShoppingCart" className="mr-2 h-4 w-4" />)
    const box = host.querySelector('[data-glyph-pending]') as SVGElement
    expect(box).not.toBeNull()
    // Same element and attributes as the real glyph, so the same CSS sizes it.
    expect(box.tagName.toLowerCase()).toBe('svg')
    expect(box.getAttribute('class')).toContain('mr-2 h-4 w-4')
    expect(box.getAttribute('width')).toBe('24')
    expect(box.getAttribute('viewBox')).toBe('0 0 24 24')
  })

  it('sizes the placeholder like the icon when `size` is given', async () => {
    const { Glyph } = await freshRegistry()
    const { host } = mount(<Glyph name="ShoppingCart" size={18} />)
    const box = host.querySelector('[data-glyph-pending]') as SVGElement
    expect(box.getAttribute('width')).toBe('18')
    expect(box.getAttribute('height')).toBe('18')
  })

  it('returns the same component for every spelling of a name', async () => {
    localStorage.setItem('mc:ui:glyphs:v1', JSON.stringify({ 'shopping-cart': SHOPPING_CART }))
    const { getGlyph } = await freshRegistry()
    const a = getGlyph('ShoppingCart')
    expect(a).toBeDefined()
    expect(getGlyph('shopping_cart')).toBe(a)
    expect(getGlyph('shopping-cart')).toBe(a)
  })

  it('draws a registered component synchronously', async () => {
    const { Glyph, registerGlyphs } = await freshRegistry()
    const Star = () => <svg data-testid="star" />
    registerGlyphs({ Star: Star as never })
    const { host } = mount(<Glyph name="star" />)
    expect(host.querySelector('[data-testid="star"]')).not.toBeNull()
  })

  it('ignores stored entries that are not plain SVG shapes', async () => {
    localStorage.setItem(
      'mc:ui:glyphs:v1',
      JSON.stringify({ evil: [['script', { src: 'x' }]], bad: [['path', { onload: 'x' }]] }),
    )
    const { getGlyph } = await freshRegistry()
    expect(getGlyph('evil')).toBeUndefined()
    expect(getGlyph('bad')).toBeUndefined()
  })

  it('loads a glyph once, stores it and keeps that component', async () => {
    const { loadGlyph, getGlyph } = await freshRegistry()
    const icon = await loadGlyph('ShoppingCart')
    expect(icon).not.toBeNull()
    expect(getGlyph('shopping-cart')).toBe(icon)
    await new Promise((r) => setTimeout(r, 0))
    const stored = JSON.parse(localStorage.getItem('mc:ui:glyphs:v1') || '{}')
    expect(Array.isArray(stored['shopping-cart'])).toBe(true)
  })

  it('reports names Lucide does not have', async () => {
    const { loadGlyph, isMissingGlyph } = await freshRegistry()
    expect(await loadGlyph('NoSuchGlyphAnywhere')).toBeNull()
    expect(isMissingGlyph('NoSuchGlyphAnywhere')).toBe(true)
  })
})
