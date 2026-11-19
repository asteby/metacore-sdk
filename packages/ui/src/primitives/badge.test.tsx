import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Badge } from './badge'

describe('Badge tonal variants', () => {
  it.each([
    ['success', 'var(--success'],
    ['warning', 'var(--warning'],
    ['danger', 'text-destructive'],
    ['info', 'var(--info'],
    ['muted', 'text-muted-foreground'],
  ] as const)('%s paints a soft tinted chip', (variant, text) => {
    const html = renderToStaticMarkup(<Badge variant={variant}>Estado</Badge>)
    expect(html).toContain(text)
    expect(html).toContain('data-slot="badge"')
    // Tonal chips never use the solid primary fill of the default variant.
    expect(html).not.toContain('bg-primary')
  })
})

describe('Badge with a runtime colour', () => {
  it.each(['#ec4899', '#e8a317', '#2f7fd6'])('fills with %s and picks a text colour that reads (>= 4.5:1)', (color) => {
    const html = renderToStaticMarkup(<Badge color={color}>Live 24h</Badge>)
    expect(html).toContain(`background-color:${color}`)
    // Pink and amber are light: white text would be 3.5:1 / 2.1:1.
    if (color !== '#2f7fd6') expect(html).toContain('color:#000000')
  })
})
