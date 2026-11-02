import { describe, expect, it } from 'vitest'
import { clampProductQuery, PRODUCT_QUERY_MAX_LENGTH, productListQuery } from './index.js'

describe('product search text (q) longer than the API accepts', () => {
  it('cuts q to 200 code points so the page does not fail with a 400', () => {
    const qs = productListQuery({ q: 'a'.repeat(3000), collection: 'filtros' })
    expect([...(qs.get('q') ?? '')]).toHaveLength(PRODUCT_QUERY_MAX_LENGTH)
    expect(qs.get('collection')).toBe('filtros')
  })

  it('counts code points, never splits an emoji, and trims', () => {
    const q = clampProductQuery(`  ${'🔧'.repeat(250)}  `)
    expect([...q]).toHaveLength(200)
    expect(q.endsWith('🔧')).toBe(true)
    expect(clampProductQuery('  filtro de aire  ')).toBe('filtro de aire')
    expect(clampProductQuery(undefined)).toBe('')
  })

  it('keeps a short q untouched and in its place', () => {
    expect(productListQuery({ q: 'balatas', first: 12 }).toString()).toBe('q=balatas&first=12')
  })

  it('a q that becomes empty after trimming is not sent', () => {
    expect(productListQuery({ q: '   ' }).has('q')).toBe(false)
  })
})
