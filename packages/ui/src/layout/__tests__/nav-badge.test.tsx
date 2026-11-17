import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NavBadge } from '../nav-badge'

describe('NavBadge', () => {
  it('renders nothing for 0', () => {
    expect(renderToStaticMarkup(<NavBadge value={{ count: 0, tone: 'info' }} />)).toBe('')
  })
  it('caps to 99+ with exact aria-label', () => {
    const h = renderToStaticMarkup(<NavBadge value={{ count: 120, tone: 'attention', label: 'pendientes' }} />)
    expect(h).toContain('99+')
    expect(h).toContain('aria-label="120 pendientes"')
    expect(h).not.toContain('!')
  })
  it('critical shows a textual bang and reduced-motion-safe pulse', () => {
    const h = renderToStaticMarkup(<NavBadge value={{ count: 3, tone: 'critical' }} />)
    expect(h).toContain('>!<')
    expect(h).toContain('motion-safe:animate-pulse')
  })
  it('attention does not pulse', () => {
    expect(renderToStaticMarkup(<NavBadge value={{ count: 3, tone: 'attention' }} />)).not.toContain('animate-pulse')
  })
})
