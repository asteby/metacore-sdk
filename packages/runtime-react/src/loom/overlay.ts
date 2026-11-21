// Overlays — parches declarativos sobre el grafo de bloques de una página
// («kustomize para UI»). Base de OPS + capas de preset, organización, sucursal,
// rol y usuario, fusionadas en orden fijo y de forma determinista.
//
// Reglas (RFC 0005 §7):
//   - Orden de capas por alcance: preset < org < branch < role < user; empate = orden de entrada.
//   - Cada capa es ATÓMICA: si una operación no aplica limpio, la capa entera se descarta y se
//     reporta el conflicto; la página queda como estaba antes de esa capa (nunca a medias).
//   - Una capa con `targets` (rango semver de la base) que no cumple la versión de la base no se
//     aplica: si la base cambió y rompe el overlay, se cae al comportamiento base y se avisa.
//   - `replace` guarda el bloque original como `fallback`: el render lo usa si el reemplazo falla.
//   - Procedencia: cada bloque sabe de qué capa viene y qué capas lo tocaron (Explain).
//   Función pura, sin React.
import { satisfiesSdkRange } from '../slots/sdk-range'

export interface PageBlock {
    id: string
    type: string
    region?: string
    config?: Record<string, unknown>
    /** Lo rellena `replace`: el bloque al que sustituyó. */
    fallback?: PageBlock
}

export interface BlockGraph {
    id: string
    /** Semver de la base (`1.4.0`). */
    version: string
    blocks: PageBlock[]
}

type Anchor = { before?: string; after?: string }

export type OverlayOp =
    | ({ op: 'add'; block: PageBlock } & Anchor)
    | { op: 'remove'; id: string }
    | ({ op: 'move'; id: string; region?: string } & Anchor)
    /** Fusión profunda de `config`; un valor `null` borra la clave. */
    | { op: 'configure'; id: string; set: Record<string, unknown> }
    | { op: 'replace'; id: string; with: PageBlock }

export type OverlayScope = 'preset' | 'org' | 'branch' | 'role' | 'user'

export interface OverlayLayer {
    id: string
    scope: OverlayScope
    /** Rango semver de la base contra la que se escribió (`^1.2`). */
    targets?: string
    ops: OverlayOp[]
}

export type OverlayConflictReason = 'base_incompatible' | 'missing_target' | 'missing_anchor' | 'duplicate_id'

export interface OverlayConflict {
    layer: string
    /** Índice de la operación (-1 = la capa entera). */
    index: number
    reason: OverlayConflictReason
    detail: string
}

export interface BlockProvenance {
    /** `base` o id de la capa que lo añadió. */
    origin: string
    /** Capas que lo modificaron, en orden. */
    touchedBy: string[]
}

export interface OverlayResult {
    graph: BlockGraph
    applied: string[]
    conflicts: OverlayConflict[]
    provenance: Record<string, BlockProvenance>
    /** Bloques quitados y por qué capa (Explain: «¿por qué NO veo esto?»). */
    removed: Record<string, string>
}

const RANK: Record<OverlayScope, number> = { preset: 0, org: 1, branch: 2, role: 3, user: 4 }

function isPlain(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** Fusión profunda; arrays se sustituyen enteros; `null` borra. */
export function mergeConfig(base: Record<string, unknown> | undefined, set: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...(base ?? {}) }
    for (const [k, v] of Object.entries(set)) {
        if (v === null) delete out[k]
        else if (isPlain(v) && isPlain(out[k])) out[k] = mergeConfig(out[k] as Record<string, unknown>, v)
        else out[k] = v
    }
    return out
}

function insertAt(list: PageBlock[], block: PageBlock, a: Anchor): string | null {
    const ref = a.before ?? a.after
    if (!ref) {
        list.push(block)
        return null
    }
    const i = list.findIndex((b) => b.id === ref)
    if (i < 0) return ref
    list.splice(a.before ? i : i + 1, 0, block)
    return null
}

export function applyOverlays(base: BlockGraph, layers: readonly OverlayLayer[]): OverlayResult {
    let blocks = base.blocks.map((b) => ({ ...b }))
    let provenance: Record<string, BlockProvenance> = {}
    for (const b of blocks) provenance[b.id] = { origin: 'base', touchedBy: [] }
    let removed: Record<string, string> = {}
    const applied: string[] = []
    const conflicts: OverlayConflict[] = []

    const ordered = layers.map((l, i) => ({ l, i })).sort((a, b) => RANK[a.l.scope] - RANK[b.l.scope] || a.i - b.i)

    for (const { l: layer } of ordered) {
        if (layer.targets && satisfiesSdkRange(base.version, layer.targets) === false) {
            conflicts.push({
                layer: layer.id,
                index: -1,
                reason: 'base_incompatible',
                detail: `escrita para ${base.id}@${layer.targets}, la base es ${base.version}`,
            })
            continue
        }
        const next = blocks.map((b) => ({ ...b }))
        const prov: Record<string, BlockProvenance> = {}
        for (const [k, v] of Object.entries(provenance)) prov[k] = { origin: v.origin, touchedBy: [...v.touchedBy] }
        const rem = { ...removed }
        let failed: OverlayConflict | null = null
        const fail = (index: number, reason: OverlayConflictReason, detail: string) => {
            failed = { layer: layer.id, index, reason, detail }
        }
        const find = (id: string) => next.findIndex((b) => b.id === id)
        const touch = (id: string) => prov[id]?.touchedBy.push(layer.id)

        layer.ops.forEach((op, index) => {
            if (failed) return
            switch (op.op) {
                case 'add': {
                    if (find(op.block.id) >= 0) return fail(index, 'duplicate_id', op.block.id)
                    const miss = insertAt(next, { ...op.block }, op)
                    if (miss) return fail(index, 'missing_anchor', miss)
                    prov[op.block.id] = { origin: layer.id, touchedBy: [] }
                    delete rem[op.block.id]
                    return
                }
                case 'remove': {
                    const i = find(op.id)
                    if (i < 0) return fail(index, 'missing_target', op.id)
                    next.splice(i, 1)
                    rem[op.id] = layer.id
                    delete prov[op.id]
                    return
                }
                case 'move': {
                    const i = find(op.id)
                    if (i < 0) return fail(index, 'missing_target', op.id)
                    const [b] = next.splice(i, 1)
                    const moved = op.region ? { ...b, region: op.region } : b
                    if (op.before ?? op.after) {
                        const miss = insertAt(next, moved, op)
                        if (miss) return fail(index, 'missing_anchor', miss)
                    } else next.splice(i, 0, moved)
                    touch(op.id)
                    return
                }
                case 'configure': {
                    const i = find(op.id)
                    if (i < 0) return fail(index, 'missing_target', op.id)
                    next[i] = { ...next[i], config: mergeConfig(next[i].config, op.set) }
                    touch(op.id)
                    return
                }
                case 'replace': {
                    const i = find(op.id)
                    if (i < 0) return fail(index, 'missing_target', op.id)
                    const original = next[i]
                    next[i] = { ...op.with, id: original.id, fallback: original.fallback ?? original }
                    touch(op.id)
                    return
                }
            }
        })
        if (failed) {
            conflicts.push(failed)
            continue
        }
        blocks = next
        provenance = prov
        removed = rem
        applied.push(layer.id)
    }
    return { graph: { ...base, blocks }, applied, conflicts, provenance, removed }
}
