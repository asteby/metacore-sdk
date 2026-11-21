// ¿Tiene injertos un seam? Sin el resolvedor: decide si se carga la UI perezosa de Loom.
import { useMemo, useSyncExternalStore } from 'react'
import { useLoomConfig } from './provider'
import { listGrafts, loomVersion, subscribeLoom } from './store'

/** ¿Hay algún injerto (local o servido) para este seam? Barato: decide si se carga la UI de Loom. */
export function useHasGrafts(seamId: string): boolean {
    const cfg = useLoomConfig()
    const v = useSyncExternalStore(subscribeLoom, loomVersion, loomVersion)
    return useMemo(
        () => listGrafts(seamId).length > 0 || (cfg?.grafts ?? []).some((g) => g.seam === seamId),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [seamId, cfg, v],
    )
}
