/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { prerenderToNodeStream } from 'react-dom/static'

const STORE = 'mc:ui:glyphs:v1'

// Node 26's own localStorage getter (undefined without --localstorage-file)
// hides happy-dom's storage.
const memory = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, String(v)),
    removeItem: (k: string) => void memory.delete(k),
    clear: () => memory.clear(),
  },
})

async function prerender(icon: Parameters<typeof createElement>[0]): Promise<string> {
  const { prelude } = await prerenderToNodeStream(createElement(icon))
  let html = ''
  for await (const chunk of prelude) html += chunk
  return html
}

// Each case imports a fresh copy of the module: a new copy is what a page
// reload runs.
async function freshModule() {
  vi.resetModules()
  return import('../addon-nav')
}

describe('resolveIconName glyph store', () => {
  beforeEach(() => localStorage.clear())

  it('stores a loaded glyph and draws it synchronously on the next load', async () => {
    const first = await freshModule()
    expect(await prerender(first.resolveIconName('shopping-cart'))).toContain('lucide-shopping-cart')
    await vi.waitFor(() => expect(localStorage.getItem(STORE)).toContain('shopping-cart'))

    const second = await freshModule()
    // renderToString does not wait for lazy components: only a synchronous
    // glyph renders here instead of the Suspense fallback.
    const html = renderToString(createElement(second.resolveIconName('ShoppingCart')))
    expect(html).toContain('lucide-shopping-cart')
    expect(html).not.toContain('lucide-circle')
  })

  it('names with a digit match their kebab glyph (Undo2 → undo-2)', async () => {
    const first = await freshModule()
    expect(await prerender(first.resolveIconName('undo-2'))).toContain('lucide-undo-2')
    await vi.waitFor(() => expect(localStorage.getItem(STORE)).toContain('undo-2'))
    const second = await freshModule()
    expect(renderToString(createElement(second.resolveIconName('Undo2')))).toContain('lucide-undo-2')
  })

  it('without a stored glyph the first render is the fallback', async () => {
    const mod = await freshModule()
    const html = renderToString(createElement(mod.resolveIconName('shopping-cart')))
    expect(html).toContain('lucide-circle')
  })

  it('ignores stored entries that are not plain SVG shapes', async () => {
    localStorage.setItem(
      STORE,
      JSON.stringify({
        'shopping-cart': [['script', { src: 'x' }]],
        'bad-attr': [['path', { onload: 'x', d: 'M0 0' }]],
      }),
    )
    const mod = await freshModule()
    expect(renderToString(createElement(mod.resolveIconName('shopping-cart')))).toContain('lucide-circle')
    expect(renderToString(createElement(mod.resolveIconName('bad-attr')))).toContain('lucide-circle')
  })
})
