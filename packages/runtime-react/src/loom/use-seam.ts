// Resolución de un seam como hook (núcleo ligero: sin componentes).
import { useMemo, useSyncExternalStore } from 'react'
import { useCan } from '../permissions-context'
import { useLoomConfig } from './provider'
import { resolveSeam } from './resolve'
import { listGrafts, loomVersion, subscribeLoom } from './store'
import type { GraftDef, ResolvedSeam, SeamContract } from './types'

export interface SeamHostContext {
    model?: string
    mode?: string
}

/** Injertos de un seam ya resueltos (montados + descartados con motivo). */
export function useSeam(contract: SeamContract, host: SeamHostContext = {}): ResolvedSeam {
    const cfg = useLoomConfig()
    const can = useCan()
    const v = useSyncExternalStore(subscribeLoom, loomVersion, loomVersion)
    return useMemo(() => {
        const local = listGrafts(contract.id)
        const byId = new Map<string, GraftDef>()
        for (const g of local) byId.set(g.id, g)
        // Lo servido manda en metadatos (orden, props); el código local aporta el componente.
        for (const s of cfg?.grafts ?? []) {
            if (s.seam !== contract.id) continue
            const l = byId.get(s.id)
            byId.set(s.id, l ? { ...l, ...s, component: l.component, load: s.load ?? l.load, part: s.part ?? l.part } : s)
        }
        const granted = cfg?.serverAuthoritative ? new Set((cfg.grafts ?? []).map((g) => g.id)) : undefined
        return resolveSeam(contract, [...byId.values()], {
            can,
            flags: cfg?.flags,
            settings: cfg?.settings,
            model: host.model,
            mode: host.mode,
            granted,
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contract, cfg, can, host.model, host.mode, v])
}

export { useHasGrafts } from './has'
