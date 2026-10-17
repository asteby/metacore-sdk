/**
 * Regression: SSR of the base mockups for 37 fixtures, frozen before this
 * change (`legacy-golden.json`). Only the supplement names with words longer
 * than 12 characters change (font fitted to the longest word, no cut).
 */
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MockupProvider, ProductImage } from '../index.js'
import { PARITY_FIXTURES } from './fixtures.js'
import golden from './legacy-golden.json'

const fixtures = (golden as { fixtures: Record<string, string> }).fixtures
const render = (f: (typeof PARITY_FIXTURES)[number]) =>
  renderToString(
    <MockupProvider labels={f.labels}>
      <ProductImage product={f.product} variant={f.variant as never} kind={f.kind} alt={f.alt} className="m" />
    </MockupProvider>,
  )
const LONG_WORDS = new Set(['supplement/bag', 'supplement/long', 'supplement/capsules'])
const withoutName = (s: string) => s.replace(/<text[^>]*font-weight="900"[^>]*>.*?<\/text>/, '').replace(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="22" rx="11"[^>]*><\/rect><text[^>]*>.*?<\/text>/, '')

describe('base mockups: unchanged SSR', () => {
  for (const f of PARITY_FIXTURES) {
    it(f.name, () => {
      const out = render(f)
      if (!LONG_WORDS.has(f.name)) return expect(out).toBe(fixtures[f.name])
      expect(withoutName(out)).toBe(withoutName(fixtures[f.name]!))
      expect(out).not.toBe(fixtures[f.name])
    })
  }
})
