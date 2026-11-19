// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { GenUI, GenUIProvider, layoutDiagram, mapLegend, normalizeMapPoints, registerGenUIBlockRenderer, renderMarkdown, toneFor } from './index'

afterEach(cleanup)
const doc = (...blocks: unknown[]) => ({ version: 'genui/v2', blocks })

describe('GenUI v2 renderer', () => {
  it('renders composition and text as text, never HTML', () => {
    const { container } = render(
      <GenUI spec={doc({ type: 'stack', blocks: [{ type: 'text', text: '<img src=x onerror=alert(1)>' }, { type: 'markdown', markdown: '**hola** <b>x</b>\n\n- uno\n- dos' }] })} />,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(container.querySelector('strong')?.textContent).toBe('hola')
    expect(container.querySelectorAll('li')).toHaveLength(2)
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy()
  })

  it('upgrades and renders a genui/v1 spec', () => {
    render(<GenUI spec={{ version: 'genui/v1', blocks: [{ type: 'kpi', items: [{ label: 'Ventas', value: '10' }] }] }} />)
    expect(screen.getByText('Ventas')).toBeTruthy()
  })

  it('drops external markdown links unless allowed, keeps app links', () => {
    const md = '[ext](https://example.com) y [app](/m/x) y [js](javascript:alert(1))'
    const { container, rerender } = render(<GenUI spec={doc({ type: 'markdown', markdown: md })} />)
    expect(container.querySelectorAll('a')).toHaveLength(1)
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/m/x')
    rerender(<GenUI spec={doc({ type: 'markdown', markdown: md })} allowExternalLinks />)
    expect(container.querySelectorAll('a')).toHaveLength(2)
    expect(container.innerHTML).not.toContain('javascript:')
  })

  it('shows tabs one at a time', () => {
    render(<GenUI spec={doc({ type: 'tabs', tabs: [{ key: 'a', label: 'Uno', blocks: [{ type: 'text', text: 'A!' }] }, { key: 'b', label: 'Dos', blocks: [{ type: 'text', text: 'B!' }] }] })} />)
    expect(screen.getByText('A!')).toBeTruthy()
    expect(screen.queryByText('B!')).toBeNull()
  })

  it('never shows a block with a `when` it cannot evaluate', () => {
    render(<GenUI spec={doc({ type: 'text', text: 'oculto', when: { ref: 'state.x', equals: 1 } }, { type: 'text', text: 'visible' })} />)
    expect(screen.queryByText('oculto')).toBeNull()
    expect(screen.getByText('visible')).toBeTruthy()
  })

  it('renders nothing (or the fallback) for an invalid spec', () => {
    const { container } = render(<GenUI spec={doc({ type: 'iframe' })} fallback={<i>no</i>} />)
    expect(container.textContent).toBe('no')
  })

  it('routes navigate through onNavigate and other verbs / confirmations to the host', () => {
    const onNavigate = vi.fn()
    const onAction = vi.fn()
    render(
      <GenUIProvider onNavigate={onNavigate} onAction={onAction}>
        <GenUI spec={doc({ type: 'empty', title: 'Nada', actions: [{ do: 'navigate', label: 'Ir', route: { path: '/m/orders' } }, { do: 'navigate', label: 'Ir seguro', route: { path: '/m/x' }, confirm: { title: '¿Seguro?' } }] })} />
      </GenUIProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ir' }))
    expect(onNavigate).toHaveBeenCalledWith('/m/orders')
    fireEvent.click(screen.getByRole('button', { name: 'Ir seguro' }))
    expect(onNavigate).toHaveBeenCalledTimes(1)
    expect(onAction).toHaveBeenCalledOnce()
  })

  it('uses a registered renderer for a block type, and a provider override wins', () => {
    const undo = registerGenUIBlockRenderer('map', ({ block }) => <p>global:{block.summary}</p>)
    const spec = doc({ type: 'map', summary: 'M', points: [{ key: 'a', lat: 1, lng: 2, label: 'A' }] })
    const { rerender } = render(<GenUI spec={spec} />)
    expect(screen.getByText('global:M')).toBeTruthy()
    rerender(
      <GenUIProvider renderers={{ map: ({ block }) => <p>local:{block.summary}</p> }}>
        <GenUI spec={spec} />
      </GenUIProvider>,
    )
    expect(screen.getByText('local:M')).toBeTruthy()
    undo()
    cleanup()
    render(<GenUI spec={spec} />)
    expect(screen.getByLabelText('M').getAttribute('data-genui-block')).toBe('map-fallback')
  })

  it('draws a metric from a host source with severity tone and trend', () => {
    render(
      <GenUIProvider sources={{ kpi: [{ total: 55 }] }}>
        <GenUI spec={{ version: 'genui/v2', data: { kpi: { widget: 'a.dashboard.b' } }, blocks: [{ type: 'metric', label: 'Pedidos', source: 'data.kpi', field: 'total', trend: 'up', thresholds: [{ at: 30, tone: 'warning' }, { at: 50, tone: 'danger' }] }] }} />
      </GenUIProvider>,
    )
    const value = screen.getByText('55')
    expect(value.className).toContain('text-destructive')
    expect(screen.getByText('al alza')).toBeTruthy()
  })

  it('draws a diagram as SVG text with accessible list and keyboard navigation', () => {
    const onNavigate = vi.fn()
    const { container } = render(
      <GenUIProvider onNavigate={onNavigate}>
        <GenUI spec={doc({ type: 'diagram', summary: 'Flujo', nodes: [{ id: 'api', label: '<script>x</script>', route: { path: '/ops/api' } }, { id: 'db', label: 'DB', tone: 'danger' }], edges: [{ from: 'api', to: 'db', label: 'SQL' }] })} />
      </GenUIProvider>,
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('svg')?.getAttribute('aria-label')).toBe('Flujo')
    const link = screen.getByRole('link')
    fireEvent.keyDown(link, { key: 'Enter' })
    expect(onNavigate).toHaveBeenCalledWith('/ops/api')
    expect(container.querySelectorAll('ul.sr-only li')).toHaveLength(3)
  })
})

describe('genui helpers', () => {
  it('layers a diagram left to right and survives cycles', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const l = layoutDiagram(nodes, [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }])
    expect(l.centers.get('a')!.x).toBeLessThan(l.centers.get('b')!.x)
    expect(l.centers.get('b')!.x).toBeLessThan(l.centers.get('c')!.x)
    const tb = layoutDiagram(nodes, [{ from: 'a', to: 'b' }], 'tb')
    expect(tb.centers.get('a')!.y).toBeLessThan(tb.centers.get('b')!.y)
  })

  it('picks the tone of the highest reached threshold', () => {
    const th = [{ at: 10, tone: 'warning' as const }, { at: 50, tone: 'danger' as const }]
    expect(toneFor(5, th)).toBe('default')
    expect(toneFor(10, th)).toBe('warning')
    expect(toneFor(70, th)).toBe('danger')
  })

  it('normalizes map points from rows, drops bad coordinates, tones by status and builds the legend', () => {
    const block = { type: 'map', status_tones: { late: 'danger' }, fields: { key: 'id', label: 'name', group: 'vertical' } }
    const pts = normalizeMapPoints(block, [
      { id: 1, name: 'A', lat: 19.4, lng: -99.1, status: 'late', vertical: 'retail', version: '1.2' },
      { id: 2, name: 'B', lat: 999, lng: 0, status: 'ok' },
      { id: 3, name: 'C', lat: 20, lng: -100, status: 'ok' },
    ])
    expect(pts.map((p) => p.key)).toEqual(['1', '3'])
    expect(pts[0]!.tone).toBe('danger')
    expect(pts[0]!.details).toEqual([{ label: 'version', value: '1.2', field: 'version' }])
    expect(mapLegend(pts).map((l) => `${l.value}:${l.count}`)).toEqual(['late:1', 'ok:1'])
    expect(mapLegend(pts, 'group').map((l) => l.value)).toEqual(['retail', '—'])
  })

  it('renderMarkdown never emits raw HTML elements for HTML-looking text', () => {
    const { container } = render(<div>{renderMarkdown('### Título\n\n<script>alert(1)</script> `code`')}</div>)
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('h3')?.textContent).toBe('Título')
    expect(container.querySelector('code')?.textContent).toBe('code')
  })
})
