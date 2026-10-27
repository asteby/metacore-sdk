// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { NavigationProgress, Skeleton, Spinner } from './navigation-progress'

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('NavigationProgress', () => {
  it('SSR: región status vacía, sin barra en marcha', () => {
    const html = renderToString(<NavigationProgress active={false} />)
    expect(html).toContain('role="status"')
    expect(html).toContain('data-phase="idle"')
  })

  it('no aparece si la navegación dura menos que el retraso (sin parpadeo)', () => {
    vi.useFakeTimers()
    const { container, rerender } = render(<NavigationProgress active={false} delay={120} />)
    rerender(<NavigationProgress active delay={120} />)
    act(() => void vi.advanceTimersByTime(80))
    rerender(<NavigationProgress active={false} delay={120} />)
    act(() => void vi.advanceTimersByTime(500))
    expect(container.querySelector('.sf-nav-progress')?.getAttribute('data-phase')).toBe('idle')
  })

  it('tras el retraso corre, anuncia el texto, marca aria-busy y al terminar completa y se retira', () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<main id="m"></main>'
    const { container, rerender } = render(<NavigationProgress active={false} label="Cargando…" />)
    rerender(<NavigationProgress active label="Cargando…" />)
    act(() => void vi.advanceTimersByTime(130))
    const root = container.querySelector('.sf-nav-progress')!
    expect(root.getAttribute('data-phase')).toBe('running')
    expect(root.textContent).toBe('Cargando…')
    expect(document.querySelector('main')?.getAttribute('aria-busy')).toBe('true')
    rerender(<NavigationProgress active={false} />)
    expect(root.getAttribute('data-phase')).toBe('done')
    expect(document.querySelector('main')?.hasAttribute('aria-busy')).toBe(false)
    act(() => void vi.advanceTimersByTime(450))
    expect(root.getAttribute('data-phase')).toBe('idle')
  })
})

describe('Skeleton y Spinner', () => {
  it('son decorativos', () => {
    expect(renderToString(<Skeleton height={20} />)).toContain('aria-hidden="true"')
    expect(renderToString(<Spinner />)).toContain('aria-hidden="true"')
  })
})
