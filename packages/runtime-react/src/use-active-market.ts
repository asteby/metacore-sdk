// Mercado de la sucursal activa. El selector de sucursal del host ya alimenta
// `BranchProvider` (`useCurrentBranch`); el kernel liga cada sucursal a un
// mercado con `branches.market_code` (código de `org_markets`: mx, us…). Este
// hook cruza los dos para que un formulario preseleccione el mercado en el que
// se está trabajando, sin que cada host lo reimplemente.
import { unwrapResponse } from '@asteby/metacore-lib/envelope'
import { useEffect, useState } from 'react'
import { useApi, useCurrentBranch } from './api-context'

export interface ActiveMarket {
    /** Sucursal activa (undefined/null sin selector de sucursal). */
    branchId: string | number | null | undefined
    /** `market_code` de la sucursal activa; null = sin sucursal, sin mercado o aún cargando. */
    market: string | null
    loading: boolean
}

// Una sucursal no cambia de mercado en una sesión: se resuelve una vez por id.
const marketByBranch = new Map<string, string | null>()
const inflight = new Map<string, Promise<string | null>>()

/** Solo para tests. */
export function clearActiveMarketCache(): void {
    marketByBranch.clear()
    inflight.clear()
}

export function normalizeMarketCode(v: unknown): string | null {
    const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
    return s === '' ? null : s
}

/**
 * `enabled: false` no consulta nada (un formulario solo lo necesita cuando hay un widget que
 * usa el mercado): devuelve la sucursal con `market: null`.
 */
export function useActiveMarket(opts: { enabled?: boolean } = {}): ActiveMarket {
    const api = useApi()
    const { id } = useCurrentBranch()
    const enabled = opts.enabled !== false
    const key = !enabled || id == null || id === '' ? null : String(id)
    const [market, setMarket] = useState<string | null>(() => (key ? (marketByBranch.get(key) ?? null) : null))
    const [loading, setLoading] = useState<boolean>(() => key != null && !marketByBranch.has(key))

    useEffect(() => {
        if (!key) {
            setMarket(null)
            setLoading(false)
            return
        }
        if (marketByBranch.has(key)) {
            setMarket(marketByBranch.get(key) ?? null)
            setLoading(false)
            return
        }
        let cancelled = false
        setLoading(true)
        let p = inflight.get(key)
        if (!p) {
            p = (async () => {
                try {
                    const rec = unwrapResponse<any>(await api.get(`/data/branches/${encodeURIComponent(key)}`))
                    const code = normalizeMarketCode(rec?.market_code ?? rec?.data?.market_code)
                    marketByBranch.set(key, code)
                    return code
                } catch {
                    // Sin permiso o sin addon de sucursales: no hay mercado, y no se reintenta en bucle.
                    marketByBranch.set(key, null)
                    return null
                } finally {
                    inflight.delete(key)
                }
            })()
            inflight.set(key, p)
        }
        void p.then((code) => {
            if (cancelled) return
            setMarket(code)
            setLoading(false)
        })
        return () => {
            cancelled = true
        }
    }, [api, key])

    return { branchId: id, market, loading }
}
