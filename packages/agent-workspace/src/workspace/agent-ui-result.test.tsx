// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('./aby-chart-embed', () => ({ AbyChartEmbed: () => null }))

import { resolveAgentResultRenderer, type AgentResult } from '@asteby/metacore-runtime-react'
import { SourceDeniedError, type SourceResolver } from '@asteby/metacore-genui'
import './agent-results'
import { agentResultsOf } from './agent-results'
import { agentUiPlainText, createAgentUiResult, prepareAgentUi } from './agent-ui-result'

afterEach(cleanup)

const result = (ui: unknown): AgentResult & { embed: { type: 'ui'; ui: unknown } } => ({ kind: 'ui', embed: { type: 'ui', ui } })
const mount = (ui: unknown, options?: Parameters<typeof createAgentUiResult>[0]) => {
  const Renderer = createAgentUiResult(options)
  return render(<Renderer result={result(ui) as never} />)
}

const sales = [
  { day: 'L', total: 3 },
  { day: 'M', total: 5 },
]

const dashboardDoc = {
  version: 'genui/v2',
  data: { kpi: { widget: 'orders.dashboard.open' }, sales: { q: 't:orders.Order?limit=7' }, rows: { inline: [{ folio: 'F-1', total: 10 }] } },
  blocks: [
    { type: 'metric', label: 'Pedidos', source: 'data.kpi', field: 'total' },
    { type: 'chart', kind: 'bar', x: 'day', series: [{ key: 'total', label: 'Total' }], source: 'data.sales', summary: 'Ventas por dia' },
    { type: 'table', source: 'data.rows', columns: [{ key: 'folio', label: 'Folio' }, { key: 'total', label: 'Total' }] },
  ],
}

describe('registry', () => {
  it('registers a renderer for ui and keeps the chart and v1 kinds', () => {
    for (const kind of ['ui', 'chart', 'record', 'view', 'count', 'image', 'proposal', 'plan', 'guide']) {
      expect(resolveAgentResultRenderer({ kind })).toBeTypeOf('function')
    }
    expect(agentResultsOf({ embeds: [{ type: 'ui', ui: {} }] as never }).map((r) => r.kind)).toEqual(['ui'])
  })
})

describe('ui v2 embed in the chat', () => {
  it('draws metric + chart + table from the host sources', async () => {
    const sources: SourceResolver = {
      resolve: async ({ name, def }) => {
        if (name === 'kpi') return [{ total: 55 }]
        if (name === 'sales') return sales
        return (def as { inline: Record<string, unknown>[] }).inline
      },
    }
    mount(dashboardDoc, { host: { sources } })
    await waitFor(() => expect(screen.getByText('55')).toBeTruthy())
    expect(screen.getByText('Pedidos')).toBeTruthy()
    expect(document.body.textContent).toContain('Ventas por dia')
    expect(screen.getAllByText('F-1').length).toBeGreaterThan(0)
    expect(document.querySelector('[data-agent-ui="doc"]')).toBeTruthy()
  })

  it('isolates a failing source: the others still draw', async () => {
    const sources: SourceResolver = {
      resolve: async ({ name, def }) => {
        if (name === 'kpi') throw new Error('boom')
        if (name === 'sales') throw new SourceDeniedError()
        return (def as { inline: Record<string, unknown>[] }).inline
      },
    }
    mount(dashboardDoc, { host: { sources } })
    await waitFor(() => expect(screen.getAllByText('F-1').length).toBeGreaterThan(0))
    await waitFor(() => expect(document.querySelectorAll('[data-genui-block="source-error"]').length).toBeGreaterThan(0))
    expect(document.body.textContent).toContain('No tienes acceso a estos datos.')
  })

  it('without host sources only inline rows are drawn; other sources are denied', async () => {
    mount(dashboardDoc)
    await waitFor(() => expect(screen.getAllByText('F-1').length).toBeGreaterThan(0))
    expect(document.body.textContent).toContain('No tienes acceso a estos datos.')
  })

  it('shows a loading state until the source answers', async () => {
    let release: (rows: Record<string, unknown>[]) => void = () => {}
    const sources: SourceResolver = { resolve: () => new Promise((r) => (release = r)) }
    mount(
      { version: 'genui/v2', data: { s: { q: 't:a' } }, blocks: [{ type: 'table', source: 'data.s', columns: [{ key: 'a', label: 'A' }] }] },
      { host: { sources } },
    )
    expect(document.querySelector('[data-genui-block="source-loading"]')).toBeTruthy()
    release([{ a: 'listo' }])
    await waitFor(() => expect(screen.getAllByText('listo').length).toBeGreaterThan(0))
  })
})

describe('actions: whitelist only', () => {
  const docWith = (actions: unknown[]) => ({
    version: 'genui/v2',
    blocks: [{ type: 'card', title: 'Tarjeta', actions }],
  })

  it('ignores an emit that is not listed and drops invoke/submit before drawing', () => {
    const onEmit = vi.fn()
    const onBlockedAction = vi.fn()
    mount(
      docWith([
        { do: 'emit', label: 'Otro', id: 'other.event' },
        { do: 'emit', label: 'Guia', id: 'aby.guide', params: { id: 'g1' } },
        { do: 'invoke', label: 'Borrar', action: 'orders.Order.delete' },
      ]),
      { emitIds: ['aby.guide'], onEmit, onBlockedAction },
    )
    expect(screen.queryByText('Borrar')).toBeNull()
    fireEvent.click(screen.getByText('Otro'))
    expect(onEmit).not.toHaveBeenCalled()
    expect(onBlockedAction).toHaveBeenCalledWith('emit_id')
    fireEvent.click(screen.getByText('Guia'))
    expect(onEmit).toHaveBeenCalledWith('aby.guide', { id: 'g1' })
  })

  it('navigates only through the host navigation for internal paths', () => {
    const onNavigate = vi.fn()
    mount(docWith([{ do: 'navigate', label: 'Abrir', route: { path: '/m/orders' } }]), { onNavigate })
    fireEvent.click(screen.getByText('Abrir'))
    expect(onNavigate).toHaveBeenCalledWith('/m/orders')
  })
})

describe('degradation', () => {
  it('replaces a block the chat cannot draw by its fallback text', () => {
    mount(
      {
        version: 'genui/v2',
        blocks: [
          { type: 'text', text: 'Resumen' },
          { type: 'table', fallback: 'Tabla no disponible aqui', columns: [{ key: 'a', label: 'A' }], rows: [{ a: 'oculto' }] },
        ],
      },
      { blocks: ['text'] },
    )
    expect(screen.getByText('Resumen')).toBeTruthy()
    expect(screen.getByText('Tabla no disponible aqui')).toBeTruthy()
    expect(screen.queryByText('oculto')).toBeNull()
  })

  it('does not draw a form: it is not in the chat whitelist', () => {
    const p = prepareAgentUi({ version: 'genui/v2', blocks: [{ type: 'text', text: 'ok' }, { type: 'confirm', title: 'Seguro', actions: [{ do: 'emit', id: 'a.b', label: 'Si' }], fallback: 'Confirmacion no disponible' }] })
    expect(JSON.stringify(p)).not.toContain('"confirm"')
    expect(JSON.stringify(p)).toContain('Confirmacion no disponible')
  })

  it('never mounts ext or custom components, even registered ones', () => {
    const p = prepareAgentUi({
      version: 'genui/v2',
      blocks: [
        { type: 'text', text: 'Hola' },
        { type: 'ext', ext: 'a.b@1', fallback: 'sin extension' },
        { type: 'section', mode: 'custom', component: 'a.b@1', fallback: 'sin gancho' },
      ],
    })
    expect(p.kind).toBe('doc')
    const json = JSON.stringify(p)
    expect(json).not.toContain('"ext"')
    expect(json).not.toContain('component')
    expect(json).toContain('sin extension')
    expect(json).toContain('sin gancho')
  })

  it('an invalid document degrades to plain text, not to an error', () => {
    mount({ version: 'genui/v2', title: 'Titulo', blocks: [{ type: 'text', text: 'Dato util' }, { type: 'no_such_block', fallback: 'x' }] })
    expect(document.querySelector('[data-agent-ui="doc"]')).toBeNull()
    expect(screen.getByText(/Titulo/)).toBeTruthy()
    expect(document.body.textContent).toContain('Dato util')
  })

  it('a non-object ui renders nothing', () => {
    const { container } = mount('basura')
    expect(container.textContent).toBe('')
  })

  it('agentUiPlainText collects readable strings', () => {
    expect(agentUiPlainText({ title: 'T', blocks: [{ type: 'text', text: 'a' }, { type: 'tabs', tabs: [{ blocks: [{ markdown: 'b' }] }] }] })).toBe('T\na\nb')
  })
})

describe('no external links', () => {
  it('rejects a document with an external link and shows only its text', () => {
    mount({
      version: 'genui/v2',
      blocks: [
        { type: 'text', text: 'Mira esto' },
        { type: 'links', items: [{ title: 'Sitio', url: 'https://evil.example/x' }] },
      ],
    })
    expect(document.querySelector('a')).toBeNull()
    expect(document.body.innerHTML).not.toContain('evil.example')
  })

  it('never draws an external href from markdown either', () => {
    mount({ version: 'genui/v2', blocks: [{ type: 'markdown', markdown: 'ver [aqui](https://evil.example) y [ok](/m/orders)' }] })
    const hrefs = [...document.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs.every((h) => !h || h.startsWith('/'))).toBe(true)
    expect(document.body.innerHTML).not.toContain('target="_blank"')
  })
})
