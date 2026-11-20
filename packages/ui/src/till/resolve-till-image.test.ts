import { describe, expect, it } from 'vitest'
import { resolveTillImageUrl } from './product-tile'

describe('resolveTillImageUrl', () => {
  it('uses the configurable media base', () => {
    expect(resolveTillImageUrl('a.png', 'https://cdn.example.com/media/')).toBe('https://cdn.example.com/media/a.png')
    expect(resolveTillImageUrl('a.png')).toBe('/api/media/a.png')
    expect(resolveTillImageUrl('https://x/y.png')).toBe('https://x/y.png')
    expect(resolveTillImageUrl(null)).toBe('')
  })
})
