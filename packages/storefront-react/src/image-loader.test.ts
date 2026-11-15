import { describe, expect, it } from 'vitest'
import { defaultImageLoader } from './components.js'

describe('defaultImageLoader', () => {
  it('adds ?width= (and height) to absolute and relative URLs', () => {
    expect(defaultImageLoader('https://cdn.example/a.jpg', 320)).toBe('https://cdn.example/a.jpg?width=320')
    expect(defaultImageLoader('/storage/a.jpg?x=1', 480, 480)).toBe('/storage/a.jpg?x=1&width=480&height=480')
  })
  it('leaves data: and blob: URLs untouched (a query would corrupt the inline bytes)', () => {
    const svg = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>')}`
    expect(defaultImageLoader(svg, 320)).toBe(svg)
    expect(defaultImageLoader('blob:https://x/1234', 320)).toBe('blob:https://x/1234')
  })
})
