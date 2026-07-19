import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { InitialsAvatar } from './initials-avatar'
import { optionColor } from '@/lib/option-colors'

// renderToStaticMarkup works in the node env (no DOM) and lets us assert the
// actual output: initials text + a deterministic background color keyed on name.
describe('InitialsAvatar', () => {
  it('renders up to two uppercase initials of the name', () => {
    const html = renderToStaticMarkup(<InitialsAvatar name="Aceite Motor" />)
    expect(html).toContain('AM')
  })

  it('derives a deterministic background color from the name (stable per name)', () => {
    const a = renderToStaticMarkup(<InitialsAvatar name="Test" />)
    const b = renderToStaticMarkup(<InitialsAvatar name="Test" />)
    expect(a).toBe(b)
    // The background is exactly the palette slot optionColor picks for the name.
    expect(a).toContain(`background-color:#${optionColor('Test')}`)
  })

  it('gives different names different colors (via the shared palette hash)', () => {
    // Two names that land on distinct palette slots.
    expect(optionColor('Aceite')).not.toBe(optionColor('Filtro'))
  })

  it('respects the size prop for box + font', () => {
    const html = renderToStaticMarkup(<InitialsAvatar name="X" size={24} />)
    expect(html).toContain('width:24px')
    expect(html).toContain('height:24px')
  })

  it('falls back to the "?" glyph for an empty name rather than an empty box', () => {
    const html = renderToStaticMarkup(<InitialsAvatar name="" />)
    expect(html).toContain('?')
  })
})
