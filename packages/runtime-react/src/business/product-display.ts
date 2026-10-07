// withOptionDisplays — completes a product search with the DECLARATIVE option
// display of the catalog model (manifest v3 `option_display`): after the search
// answers, ONE `GET /options/<model>?field=id&ids=…` resolves the display of
// exactly the products found (price, stock contributed by inventory with its
// tone — in the document's warehouse when `ctx.warehouse_id` is given —,
// badges) and attaches it to each result. The search keeps owning the business
// data (price, tax, unit, fiscal keys the line needs); the display only paints
// the row. A host without the endpoint / model without display → results
// unchanged (never fails the search).
import type { OptionDisplayData } from '../option-display'
import type { ProductResult } from './product-search'

interface ApiLike {
    get: (url: string, cfg?: { params?: Record<string, unknown>; signal?: AbortSignal }) => Promise<{ data: any }>
}

export interface OptionDisplaysOptions {
    /** Catalog model the options endpoint resolves (e.g. `products.Product`). */
    model: string
    /** Picker context (`ctx.<key>`), e.g. `{ warehouse_id }`. Empty values are dropped. */
    context?: Record<string, string | null | undefined>
}

/** Max ids per lookup (kernel MaxOptionsIDs). */
const MAX_IDS = 100

export function withOptionDisplays<Q>(
    search: (query: Q, signal: AbortSignal) => Promise<ProductResult[]>,
    api: ApiLike,
    opts: OptionDisplaysOptions,
): (query: Q, signal: AbortSignal) => Promise<ProductResult[]> {
    const ctx: Record<string, string> = {}
    for (const [k, v] of Object.entries(opts.context ?? {})) {
        if (v != null && String(v).trim()) ctx[`ctx.${k}`] = String(v).trim()
    }
    return async (query, signal) => {
        const rows = await search(query, signal)
        const ids = [...new Set(rows.filter((r) => !r.display && r.id).map((r) => r.id))].slice(0, MAX_IDS)
        if (ids.length === 0) return rows
        let byId: Map<string, OptionDisplayData>
        try {
            const res = await api.get(`/options/${opts.model}`, { params: { field: 'id', ids: ids.join(','), ...ctx }, signal })
            const data: unknown = res?.data?.data
            byId = new Map()
            if (Array.isArray(data)) {
                for (const o of data) {
                    const d = o && typeof o === 'object' ? (o as { display?: unknown }).display : null
                    const id = o && typeof o === 'object' ? (o as { id?: unknown; value?: unknown }).id ?? (o as { value?: unknown }).value : null
                    if (d && typeof d === 'object' && id != null) byId.set(String(id).toLowerCase(), d as OptionDisplayData)
                }
            }
        } catch {
            if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
            return rows
        }
        if (byId.size === 0) return rows
        return rows.map((r) => {
            const d = byId.get(String(r.id).toLowerCase())
            return d && !r.display ? { ...r, display: d } : r
        })
    }
}
