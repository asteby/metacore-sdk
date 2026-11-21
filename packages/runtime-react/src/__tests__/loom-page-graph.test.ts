// Pagina como datos (genui.page-graph/v1) + overlays: el arbol de genui pasa por la fusion plana de Loom
// y vuelve a ser un arbol valido que `resolveGraph` compila. La funcion de fusion es la de Loom (no se duplica).
import { describe, expect, it } from 'vitest'
import { fromBlockGraph, indexGraph, parsePageGraph, resolveGraph, toBlockGraph, type PageGraph } from '@asteby/metacore-genui'
import { applyOverlays, type OverlayLayer } from '../loom'

const base: PageGraph = {
    version: 'genui.page-graph/v1',
    id: 'dashboard',
    root: [
        {
            id: 'kpis',
            type: 'grid',
            props: { areas: ['a b'], columns: ['1fr', '1fr'] },
            children: [
                { id: 'kpi.sales', type: 'kpi_card', area: 'a', props: { label: 'Ventas', value: 1 } },
                { id: 'kpi.margin', type: 'kpi_card', area: 'b', props: { label: 'Margen', value: 2 }, visible: { permission: 'reports.margin.read' } },
            ],
        },
        { id: 'recent', type: 'section', props: { mode: 'declarative', title: 'Recientes' } },
    ],
}

const run = (layers: OverlayLayer[]) => {
    const { graph: flat } = toBlockGraph(base, '1.0.0')
    const r = applyOverlays(flat, layers)
    const back = fromBlockGraph(r.graph, {}, Object.fromEntries(Object.entries(r.provenance).map(([k, v]) => [k, { origin: v.origin }])))
    return { r, ...back }
}

describe('page graph + applyOverlays', () => {
    it('add / configure / move / remove keep a valid tree and the stable ids', () => {
        const { r, graph, orphans } = run([
            {
                id: 'preset.7leguas',
                scope: 'preset',
                ops: [
                    { op: 'add', block: { id: 'leguas.vehicles', type: 'kpi_card', region: 'kpis', config: { area: 'a', label: 'Vehiculos', value: 3 } }, after: 'kpi.sales' },
                    { op: 'configure', id: 'kpi.sales', set: { label: 'Ventas netas' } },
                ],
            },
            { id: 'org.matriz', scope: 'org', ops: [{ op: 'remove', id: 'recent' }] },
        ])
        expect(r.conflicts).toEqual([])
        expect(orphans).toEqual([])
        expect(parsePageGraph(graph).ok).toBe(true)
        const idx = indexGraph(graph)
        expect([...idx.keys()]).toEqual(['kpis', 'kpi.sales', 'leguas.vehicles', 'kpi.margin'])
        expect(idx.get('kpi.sales')!.node.props).toMatchObject({ label: 'Ventas netas' })
        expect(idx.get('leguas.vehicles')!.node.origin).toBe('preset.7leguas')
        const blocks = resolveGraph(graph, { can: () => true }).blocks
        expect((blocks[0]!.blocks as Array<{ id: string }>).map((b) => b.id)).toEqual(['kpi.sales', 'leguas.vehicles', 'kpi.margin'])
    })

    it('visibility survives a configure and is enforced after the merge', () => {
        const { graph } = run([{ id: 'org.x', scope: 'org', ops: [{ op: 'configure', id: 'kpi.sales', set: { visible: { setting: { key: 'sales.kpi', equals: true } } } }] }])
        expect(parsePageGraph(graph).ok).toBe(true)
        expect(resolveGraph(graph, { can: () => true, settings: {} }).hidden).toContainEqual({ id: 'kpi.sales', reason: 'setting', detail: 'sales.kpi' })
        expect(resolveGraph(graph, { can: () => true, settings: { 'sales.kpi': true } }).hidden).toEqual([])
    })

    it('replace keeps the original as fallback_node and its position', () => {
        const { graph } = run([{ id: 'preset.p', scope: 'preset', ops: [{ op: 'replace', id: 'kpi.margin', with: { id: 'x', type: 'ext', config: { ext: 'crm.margin@1' } } }] }])
        const n = indexGraph(graph).get('kpi.margin')!
        expect(n.parentId).toBe('kpis')
        expect(n.node).toMatchObject({ type: 'ext', props: { ext: 'crm.margin@1' }, fallback_node: { type: 'kpi_card', props: { label: 'Margen' } } })
        expect(resolveGraph(graph, { can: () => true }).fallbacks['kpi.margin']).toMatchObject({ type: 'kpi_card', label: 'Margen' })
    })

    it('a layer that fails is discarded whole and the tree is the base', () => {
        const { r, graph } = run([{ id: 'org.bad', scope: 'org', ops: [{ op: 'remove', id: 'recent' }, { op: 'remove', id: 'nope' }] }])
        expect(r.conflicts).toHaveLength(1)
        expect([...indexGraph(graph).keys()]).toEqual(['kpis', 'kpi.sales', 'kpi.margin', 'recent'])
    })
})
