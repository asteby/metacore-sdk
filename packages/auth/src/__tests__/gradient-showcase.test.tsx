import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  GradientShowcase,
  buildGradient,
  DEFAULT_GRADIENT_COLORS,
} from '../showcases/gradient'

describe('GradientShowcase', () => {
  it('builds a gradient from custom stops and angle', () => {
    expect(buildGradient(['#000', '#fff'], 90)).toBe('linear-gradient(90deg, #000, #fff)')
  })

  it('falls back to theme colors with fewer than two stops or a bad angle', () => {
    expect(buildGradient(['#000'])).toContain(DEFAULT_GRADIENT_COLORS[1])
    expect(buildGradient(undefined, Number.NaN)).toContain('135deg')
  })

  it('renders title, subtitle and children in the slot', () => {
    const html = renderToStaticMarkup(
      createElement(GradientShowcase, { title: 'Hola', subtitle: 'Sub' }, createElement('i', null, 'slot')),
    )
    expect(html).toContain('Hola')
    expect(html).toContain('Sub')
    expect(html).toContain('<i>slot</i>')
    expect(html).toContain('linear-gradient')
  })

  it('renders only children without a title, and hides decoration from a11y', () => {
    const html = renderToStaticMarkup(
      createElement(GradientShowcase, { blobs: true, scrim: true }, createElement('b', null, 'x')),
    )
    expect(html).not.toContain('<h2')
    expect(html).toContain('aria-hidden="true"')
  })

  it('omits blobs when disabled', () => {
    const html = renderToStaticMarkup(createElement(GradientShowcase, { blobs: false }))
    expect(html).not.toContain('blur-3xl')
  })
})
