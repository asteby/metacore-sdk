import { useCallback, useEffect, useState } from 'react'
import { useApi } from '../api-context'
import { buildRelationFilterParams } from '../dynamic-relation-helpers'
import type { DocumentSourceDef } from './types'

const DEFAULT_LIMIT = 50
// El kernel ≥ 0.139.2 acepta listas `in:` largas; se parte para no exceder la URL.
const VIA_CHUNK = 40

type Rows = Record<string, unknown>[]

export interface DocumentSourcesState {
    sources: Record<string, Record<string, unknown>[]>
    /**
     * Total del servidor por fuente directa (`meta.total`), para que un contador
     * diga 312 y no «50» (el tamaño de la página que se trajo). Una fuente sin
     * `meta.total` —o de dos saltos— no aparece: el contador cae al largo de sus filas.
     */
    totals: Record<string, number>
    loading: boolean
    /** Vuelve a pedir todas las fuentes (tras ejecutar una acción). */
    reload: () => void
}

/**
 * Carga las filas relacionadas con el documento (pagos, REP, notas de crédito…)
 * que alimentan contadores, pestañas y derivados. Un fallo en una fuente deja
 * esa fuente vacía: la página sigue siendo usable.
 */
export function useDocumentSources(
    defs: DocumentSourceDef[] | undefined,
    recordId: string | number | undefined,
): DocumentSourcesState {
    const api = useApi()
    const [sources, setSources] = useState<Record<string, Record<string, unknown>[]>>({})
    const [totals, setTotals] = useState<Record<string, number>>({})
    const [loading, setLoading] = useState(false)
    const [nonce, setNonce] = useState(0)
    const reload = useCallback(() => setNonce((n) => n + 1), [])

    useEffect(() => {
        if (!defs || defs.length === 0 || recordId === undefined || recordId === null) {
            setSources({})
            setTotals({})
            return
        }
        let cancelled = false
        setLoading(true)
        const seenTotals: Record<string, number> = {}
        const fetchRows = async (d: DocumentSourceDef, params: Record<string, string>): Promise<Rows> => {
            try {
                const res = await api.get(`/data/${d.model}`, {
                    params: { ...params, page: 1, per_page: d.limit ?? DEFAULT_LIMIT },
                })
                const body = res.data
                const rows = (body?.data ?? body) as unknown
                const total = body?.meta?.total
                // Sólo las consultas directas (sin `via`): las de dos saltos se parten en trozos y no suman.
                if (!d.via && typeof total === 'number' && Number.isFinite(total)) seenTotals[d.key] = total
                return Array.isArray(rows) ? (rows as Rows) : []
            } catch {
                return []
            }
        }
        const direct = defs.filter((d) => !d.via)
        const hopped = defs.filter((d) => d.via)
        ;(async () => {
            const out: Record<string, Rows> = {}
            await Promise.all(
                direct.map(async (d) => {
                    out[d.key] = await fetchRows(d, buildRelationFilterParams(d.foreignKey, recordId, d.where))
                }),
            )
            // Segundo salto: depende de las filas del primero.
            for (const d of hopped) {
                const ids = Array.from(
                    new Set((out[d.via!.source] ?? []).map((r) => r[d.via!.field]).filter((v) => v != null && v !== '').map(String)),
                )
                const chunks: string[][] = []
                for (let i = 0; i < ids.length; i += VIA_CHUNK) chunks.push(ids.slice(i, i + VIA_CHUNK))
                const parts = await Promise.all(
                    chunks.map((c) => {
                        const params: Record<string, string> = { [`f_${d.foreignKey}`]: `in:${c.join(',')}` }
                        for (const [k, v] of Object.entries(d.where ?? {})) params[`f_${k}`] = `eq:${v}`
                        return fetchRows(d, params)
                    }),
                )
                out[d.key] = parts.flat()
            }
            return out
        })()
            .then((out) => {
                if (cancelled) return
                setSources(out)
                setTotals(seenTotals)
                setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [api, defs, recordId, nonce])

    return { sources, totals, loading, reload }
}
