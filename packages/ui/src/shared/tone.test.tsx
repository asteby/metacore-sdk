// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { toneClasses, toTone, toneVar } from './tone'
import { Delta } from './delta'
import { KpiCard } from './kpi-card'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
function render(node: React.ReactNode) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  act(() => createRoot(host).render(node))
  return { container: host, getByRole: (r: string) => host.querySelector(`[role=${r}]`)!, queryByTestId: (id: string) => host.querySelector(`[data-testid=${id}]`) }
}

describe('tone', () => {
  it('normalizes aliases (genui default, legacy primary/neutral) and falls back', () => {
    expect(toTone('default')).toBe('muted')
    expect(toTone('primary')).toBe('brand')
    expect(toTone('emerald')).toBe('success')
    expect(toTone('nope')).toBe('muted')
    expect(toneClasses('nope', 'bar')).toBe('bg-tone-muted')
    expect(toneVar('danger')).toBe('var(--tone-danger)')
  })
})

describe('Delta', () => {
  it('renders nothing without a value, and inverts good/bad', () => {
    expect(render(<Delta value={null} />).container.firstChild).toBeNull()
    const up = render(<Delta value={12.5} />).container
    expect(up.textContent).toContain('+12.5%')
    expect(up.innerHTML).toContain('tone-success')
    expect(render(<Delta value={12.5} invert />).container.innerHTML).toContain('tone-danger')
  })
})

describe('KpiCard', () => {
  it('groups label + value and shows the delta and chart only in hero', () => {
    const { getByRole, queryByTestId } = render(<KpiCard label='Ventas' value='$10' delta={3} hero chart={<i data-testid='c' />} />)
    expect(getByRole('group').getAttribute('aria-label')).toBe('Ventas: $10')
    expect(queryByTestId('c')).not.toBeNull()
    expect(render(<KpiCard label='x' value='1' chart={<i data-testid='d' />} />).queryByTestId('d')).toBeNull()
  })
})
