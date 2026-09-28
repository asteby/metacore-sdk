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
