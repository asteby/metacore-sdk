// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { defineBlock, registerPageBlock } from './custom'
import { PAGE_GRAPH_VERSION, graphIds, indexGraph, pageToGraph, parsePageGraph, resolveGraph, type GraphNode, type PageGraph } from './graph'
import { PageGraphView } from './graph-view'
import example from '../../examples/dashboard.page-graph.json'

afterEach(cleanup)

const node = (id: string, extra: Partial<GraphNode> = {}): GraphNode => ({ id, type: 'section', ...extra })
const graph = (root: GraphNode[]): PageGraph => ({ version: PAGE_GRAPH_VERSION, id: 'p', root })
const codes = (input: unknown) => {
  const r = parsePageGraph(input)
  return r.ok ? [] : r.errors.map((e) => e.code)
}

describe('parsePageGraph', () => {
  it('accepts the shipped example', () => {
    expect(parsePageGraph(example).ok).toBe(true)
  })

  it('reports every problem with a stable code', () => {
    expect(codes(null)).toEqual(['page_graph.shape'])
    expect(codes({ ...graph([]), version: 'x' })).toContain('page_graph.version')
    expect(codes(graph([node('a'), node('a')]))).toContain('page_graph.id_duplicate')
    expect(codes(graph([node('1bad')]))).toContain('page_graph.id_invalid')
    expect(codes(graph([node('a', { type: 'Bad Type' })]))).toContain('page_graph.type_invalid')
    expect(codes(graph([node('a', { props: { type: 'x', blocks: [] } })]))).toEqual(['page_graph.props_reserved', 'page_graph.props_reserved'])
    expect(codes(graph([node('a', { type: 'tab' })]))).toContain('page_graph.tab_parent')
    expect(codes(graph([node('t', { type: 'tabs', children: [node('c')] })]))).toContain('page_graph.tab_parent')
    expect(codes(graph([node('a', { visible: { when: { ref: 'record.x' } } })]))).toContain('page_graph.visibility')
  })

  it('rejects prototype keys, deep trees and too many nodes', () => {
    expect(codes(JSON.parse('{"version":"genui.page-graph/v1","id":"p","root":[{"id":"a","type":"x","props":{"__proto__":{"x":1}}}]}'))).toContain('page_graph.forbidden_key')
    let deep: GraphNode = node('n0')
    for (let i = 1; i < 12; i++) deep = node(`n${i}`, { children: [deep] })
    expect(codes(graph([deep]))).toContain('page_graph.limit.depth')
    expect(codes(graph(Array.from({ length: 501 }, (_, i) => node(`n${i}`))))).toContain('page_graph.limit.nodes')
  })
})

describe('indexGraph / graphIds', () => {
  it('addresses nodes by stable id with parent and position', () => {
    const g = example as unknown as PageGraph
    const idx = indexGraph(g)
    expect(idx.get('kpi.margin')).toMatchObject({ parentId: 'kpis', index: 1, via: 'child' })
    expect(idx.get('kpis')).toMatchObject({ parentId: undefined, index: 0, via: 'root' })
    expect(idx.get('client360.base')).toMatchObject({ parentId: 'client360', via: 'fallback' })
    expect(graphIds(g).slice(0, 3)).toEqual(['kpis', 'kpi.sales', 'kpi.margin'])
  })
})

describe('resolveGraph', () => {
  const g = example as unknown as PageGraph

  it('prunes by permission and setting and says why', () => {
    const none = resolveGraph(g, { can: () => false, settings: {} })
    expect(none.hidden).toEqual([
      { id: 'kpi.margin', reason: 'permission', detail: 'reports.margin.read' },
      { id: 'kpi.fleet', reason: 'setting', detail: 'workshop.enabled' },
    ])
    const all = resolveGraph(g, { can: () => true, settings: { 'workshop.enabled': true } })
    expect(all.hidden).toEqual([])
    expect((all.blocks[0]!.blocks as unknown[]).length).toBe(3)
  })

  it('denies declared permissions when no can is given and never reads inherited settings', () => {
    expect(resolveGraph(g).hidden.map((h) => h.id)).toEqual(['kpi.margin', 'kpi.fleet'])
    const r = resolveGraph(graph([node('a', { visible: { setting: { key: 'toString', empty: false } } })]), { settings: {} })
    expect(r.hidden).toEqual([{ id: 'a', reason: 'setting', detail: 'toString' }])
  })

  it('flattens props, keeps ids and compiles tabs and fallback_node', () => {
    const r = resolveGraph(g, { can: () => true, settings: { 'workshop.enabled': true } })
    const tabs = r.blocks[1]!
    expect(tabs).toMatchObject({ type: 'tabs', id: 'detail', label: 'Detalle' })
    const t = tabs.tabs as Array<{ key: string; blocks: PageGraphBlock[] }>
    expect(t.map((x) => x.key)).toEqual(['sales', 'custom'])
    expect(t[0]!.blocks[0]).toMatchObject({ type: 'section', id: 'sales.section', source: 'data.sales' })
    expect(r.fallbacks.client360).toMatchObject({ id: 'client360.base', type: 'section' })
  })

  it('keeps a dynamic when on the block', () => {
    const when = { ref: 'state.range', equals: '30d' }
    expect(resolveGraph(graph([node('a', { visible: { when } })])).blocks[0]!.when).toEqual(when)
  })
})

type PageGraphBlock = Record<string, unknown>

describe('pageToGraph', () => {
  it('adopts a page keeping declared ids and reporting generated ones', () => {
    const { graph: g, generated } = pageToGraph(
      { blocks: [{ type: 'grid', id: 'top', blocks: [{ type: 'kpi_card', label: 'x', value: 1 }, { type: 'kpi_card', id: 'named', label: 'y', value: 2 }] }, { type: 'tabs', id: 'tb', tabs: [{ key: 'one', label: 'Uno', blocks: [{ type: 'stats', items: [] }] }] }] },
      { id: 'adopted' },
    )
    expect(parsePageGraph(g).ok).toBe(true)
    expect(generated).toEqual(['top.kpi_card-0', 'tb.tab-one', 'tb.tab-one.stats-0'])
    // ida y vuelta: compilar el grafo adoptado da las mismas vistas
    const back = resolveGraph(g).blocks
    expect(back[0]!.blocks).toMatchObject([{ id: 'top.kpi_card-0', label: 'x' }, { id: 'named' }])
    expect((back[1]!.tabs as Array<{ key: string }>)[0]!.key).toBe('one')
  })
})

describe('PageGraphView', () => {
  const kpi = (id: string, label: string, extra: Partial<GraphNode> = {}): GraphNode => ({ id, type: 'kpi_card', props: { label, value: 1 }, ...extra })

  it('renders the graph and prunes what the viewer cannot see', () => {
    const onResolved = vi.fn()
    render(<PageGraphView graph={graph([kpi('a', 'Visible'), kpi('b', 'Secreto', { visible: { permission: 'x.y' } })])} can={() => false} onResolved={onResolved} />)
    expect(screen.getByText('Visible')).toBeTruthy()
    expect(screen.queryByText('Secreto')).toBeNull()
    expect(onResolved).toHaveBeenCalledWith({ hidden: [{ id: 'b', reason: 'permission', detail: 'x.y' }] })
  })

  it('wraps every node with a layout-neutral marker carrying its id', () => {
    const { container } = render(<PageGraphView graph={graph([kpi('a', 'Uno')])} />)
    const el = container.querySelector('[data-graph-node="a"]') as HTMLElement
    expect(el).toBeTruthy()
    expect(el.style.display).toBe('contents')
  })

  it('isolates a failing block: siblings stay, the failure is reported, retry is offered', () => {
    const Boom = () => {
      throw new Error('boom')
    }
    const unregister = registerPageBlock(defineBlock({ name: 'test.boom@1', component: Boom }))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onNodeError = vi.fn()
    render(
      <PageGraphView
        graph={graph([kpi('ok', 'Sigue'), { id: 'bad', type: 'ext', props: { ext: 'test.boom@1' } }])}
        onNodeError={onNodeError}
      />,
    )
    expect(screen.getByText('Sigue')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('fallo')
    expect(onNodeError).toHaveBeenCalledWith(expect.objectContaining({ id: 'bad' }))
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy()
    spy.mockRestore()
    unregister()
  })

  it('renders fallback_node when the node throws', () => {
    const Boom = () => {
      throw new Error('boom')
    }
    const unregister = registerPageBlock(defineBlock({ name: 'test.boom2@1', component: Boom }))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<PageGraphView graph={graph([{ id: 'x', type: 'ext', props: { ext: 'test.boom2@1' }, fallback_node: kpi('x.orig', 'Original') }])} />)
    expect(screen.getByText('Original')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    spy.mockRestore()
    unregister()
  })

  it('does not remount the page when callbacks change identity', () => {
    const g = graph([kpi('a', 'Uno')])
    const { container, rerender } = render(<PageGraphView graph={g} onNodeError={() => {}} />)
    const before = container.querySelector('[data-graph-node="a"]')
    rerender(<PageGraphView graph={g} onNodeError={() => {}} />)
    expect(container.querySelector('[data-graph-node="a"]')).toBe(before)
  })

  it('shows an alert (and reports codes) for an invalid graph instead of throwing', () => {
    const onInvalid = vi.fn()
    render(<PageGraphView graph={{ version: 'nope', id: 'p', root: [] }} onInvalid={onInvalid} />)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(onInvalid).toHaveBeenCalledWith([expect.objectContaining({ code: 'page_graph.version' })])
  })

  it('renders the example with tabs and keyboard-selectable views', () => {
    render(<PageGraphView graph={example} can={() => true} settings={{ 'workshop.enabled': true }} />)
    expect(screen.getByText('Vehiculos en taller')).toBeTruthy()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Ventas', 'Cliente 360'])
    fireEvent.click(tabs[1]!)
    expect(screen.getByText('Cliente 360 no disponible')).toBeTruthy()
  })
})
