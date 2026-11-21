// Registro en proceso de Parts e injertos. Mismo patrón observable que
// field-widget-registry / slotStore: Map de módulo + versión para useSyncExternalStore.
// Cada entrada lleva su addon dueño para soltarla en bloque (unbind del fiber).
import type { GraftDef, PartDef } from './types'

type Listener = () => void

const grafts = new Map<string, { def: GraftDef; seq: number }>()
const parts = new Map<string, PartDef>()
const listeners = new Set<Listener>()
let version = 0
let seq = 0

function emit(): void {
    version++
    for (const l of [...listeners]) l()
}

/** Registra (o reemplaza, mismo id) un injerto. Devuelve el disposer. */
export function registerGraft(def: GraftDef): () => void {
    const entry = { def, seq: ++seq }
    grafts.set(def.id, entry)
    emit()
    return () => {
        if (grafts.get(def.id) === entry) {
            grafts.delete(def.id)
            emit()
        }
    }
}

/** Registra (o reemplaza) un componente expuesto. */
export function registerPart(def: PartDef): () => void {
    parts.set(def.id, def)
    emit()
    return () => {
        if (parts.get(def.id) === def) {
            parts.delete(def.id)
            emit()
        }
    }
}

export function getPart(id: string): PartDef | undefined {
    return parts.get(id)
}

/** Injertos registrados para un seam, en orden de registro. */
export function listGrafts(seam?: string): GraftDef[] {
    return [...grafts.values()]
        .filter((e) => !seam || e.def.seam === seam)
        .sort((a, b) => a.seq - b.seq)
        .map((e) => e.def)
}

/** Quita todo lo de un addon (unbind). Devuelve cuántas entradas. */
export function unregisterLoomByAddon(addon: string): number {
    let n = 0
    for (const [id, e] of [...grafts]) if (e.def.addon === addon) (grafts.delete(id), n++)
    for (const [id, p] of [...parts]) if (p.addon === addon) (parts.delete(id), n++)
    if (n) emit()
    return n
}

export function clearLoom(): void {
    if (!grafts.size && !parts.size) return
    grafts.clear()
    parts.clear()
    emit()
}

export function subscribeLoom(l: Listener): () => void {
    listeners.add(l)
    return () => {
        listeners.delete(l)
    }
}

export function loomVersion(): number {
    return version
}
