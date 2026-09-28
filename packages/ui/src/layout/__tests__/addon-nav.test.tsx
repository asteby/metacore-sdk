import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
import { resolveIconName, FALLBACK_ITEM_ICON } from '../addon-nav'

// prerender waits for the lazy glyph (the icon map and the glyph are both
// import()s), so the markup is the resolved icon, not the Suspense fallback.
async function render(icon: ReturnType<typeof resolveIconName>): Promise<string> {
  const { prelude } = await prerenderToNodeStream(createElement(icon, { className: 'x' }))
  let html = ''
  for await (const chunk of prelude) html += chunk
  return html
}

describe('resolveIconName', () => {
  it('returns the fallback itself when no name is declared', () => {
    expect(resolveIconName(undefined)).toBe(FALLBACK_ITEM_ICON)
  })

  it('renders the named glyph, whatever the casing', async () => {
    const html = await render(resolveIconName('ShoppingCart'))
    expect(html).toContain('lucide-shopping-cart')
  })

  it('renders the fallback glyph for a name Lucide does not have', async () => {
    const html = await render(resolveIconName('no-such-glyph-qa'))
    expect(html).toContain('lucide-circle')
  })
})
