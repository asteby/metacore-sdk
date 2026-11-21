// Overlays sobre el grafo de bloques del tablero: base de OPS + capas del preset
// (7 Leguas), organización y rol.
import { describe, expect, it } from 'vitest'
import { applyOverlays, mergeConfig, type BlockGraph, type OverlayLayer } from '../loom'

const base: BlockGraph = {
    id: 'ops.dashboard',
    version: '1.3.0',
    blocks: [
        { id: 'kpi.sales', type: 'kpi', config: { metric: 'sales', range: '7d', style: { tone: 'primary' } } },
        { id: 'chart.sales', type: 'chart', config: { kind: 'line' } },
        { id: 'list.recent', type: 'table', config: { model: 'SalesOrder' } },
    ],
}
const ids = (g: BlockGraph) => g.blocks.map((b) => b.id)

describe('applyOverlays', () => {
    it('aplica capas por alcance (preset < org < role) sin importar el orden de entrada', () => {
        const layers: OverlayLayer[] = [
            { id: 'role.cajero', scope: 'role', ops: [{ op: 'remove', id: 'leguas.vehicles' }] },
            {
                id: 'preset.7leguas',
                scope: 'preset',
                targets: '^1.2',
                ops: [
                    { op: 'add', block: { id: 'leguas.vehicles', type: 'kpi', config: { metric: 'vehicles' } }, after: 'kpi.sales' },
                    { op: 'configure', id: 'kpi.sales', set: { range: '30d', style: { tone: null } } },
                ],
            },
            { id: 'org.matriz', scope: 'org', ops: [{ op: 'move', id: 'list.recent', before: 'kpi.sales' }] },
        ]
        const r = applyOverlays(base, layers)
        expect(r.applied).toEqual(['preset.7leguas', 'org.matriz', 'role.cajero'])
        expect(ids(r.graph)).toEqual(['list.recent', 'kpi.sales', 'chart.sales'])
        expect(r.graph.blocks[1].config).toEqual({ metric: 'sales', range: '30d', style: {} })
        expect(r.removed).toEqual({ 'leguas.vehicles': 'role.cajero' })
        expect(r.provenance['kpi.sales']).toEqual({ origin: 'base', touchedBy: ['preset.7leguas'] })
        expect(r.conflicts).toEqual([])
    })

    it('una capa es atómica: si una operación no aplica, no aplica ninguna', () => {
        const r = applyOverlays(base, [
            {
                id: 'org.x',
                scope: 'org',
                ops: [
                    { op: 'remove', id: 'chart.sales' },
                    { op: 'configure', id: 'kpi.inexistente', set: { a: 1 } },
                ],
            },
        ])
        expect(ids(r.graph)).toEqual(ids(base))
        expect(r.conflicts).toEqual([{ layer: 'org.x', index: 1, reason: 'missing_target', detail: 'kpi.inexistente' }])
        expect(r.applied).toEqual([])
    })

    it('si la base cambió de mayor, la capa cae al comportamiento base y avisa', () => {
        const r = applyOverlays({ ...base, version: '2.0.0' }, [
            { id: 'preset.7leguas', scope: 'preset', targets: '^1.2', ops: [{ op: 'remove', id: 'chart.sales' }] },
        ])
        expect(ids(r.graph)).toEqual(ids(base))
        expect(r.conflicts[0]).toMatchObject({ reason: 'base_incompatible', index: -1 })
    })

    it('replace guarda el original como fallback y conserva el id', () => {
        const r = applyOverlays(base, [
            { id: 'preset.p', scope: 'preset', ops: [{ op: 'replace', id: 'chart.sales', with: { id: 'x', type: 'leguas.sales-chart' } }] },
        ])
        const b = r.graph.blocks[1]
        expect(b).toMatchObject({ id: 'chart.sales', type: 'leguas.sales-chart' })
        expect(b.fallback).toMatchObject({ type: 'chart' })
    })

    it('add con id repetido o ancla inexistente es conflicto', () => {
        const r = applyOverlays(base, [
            { id: 'a', scope: 'org', ops: [{ op: 'add', block: { id: 'kpi.sales', type: 'kpi' } }] },
            { id: 'b', scope: 'org', ops: [{ op: 'add', block: { id: 'n', type: 'kpi' }, before: 'nope' }] },
        ])
        expect(r.conflicts.map((c) => c.reason)).toEqual(['duplicate_id', 'missing_anchor'])
    })

    it('no muta la base y es determinista', () => {
        const snap = JSON.stringify(base)
        const layers: OverlayLayer[] = [{ id: 'o', scope: 'org', ops: [{ op: 'configure', id: 'kpi.sales', set: { range: '1d' } }] }]
        const a = applyOverlays(base, layers)
        const b = applyOverlays(base, layers)
        expect(JSON.stringify(base)).toBe(snap)
        expect(a).toEqual(b)
    })

    it('mergeConfig: arrays se sustituyen, null borra', () => {
        expect(mergeConfig({ a: [1, 2], b: { c: 1, d: 2 } }, { a: [3], b: { d: null } })).toEqual({ a: [3], b: { c: 1 } })
    })
})
