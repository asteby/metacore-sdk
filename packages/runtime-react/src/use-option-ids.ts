// useResolveOptionIds — labels for values a picker already holds.
//
// A RecordPicker editing a saved record (a product with its brand) holds an id
// whose label is in no loaded page: options load only once the popover opens,
// so the trigger used to show the raw UUID unless the caller had a seed (the
// relation sibling the table served). This hook asks the canonical options
// endpoint for exactly those ids:
//
//   GET /api/options/<ref>?field=id&ids=a,b
//
// - One react-query entry per (org/branch, endpoint, field, id): two pickers
//   on the same value share it, and nothing is refetched for 30 s.
// - Every id requested within a few ms for the same endpoint + field travels in
//   ONE request (a column of cells, a multi-select's chips), chunked at the
//   kernel's 100-id cap.
// - A host that predates `ids` ignores the parameter and answers a first page.
//   The answer is then filtered by id: a hit still resolves, a miss stays
//   `unknown` (the caller shows the value as before) instead of being reported
//   as deleted. A response that only holds requested ids is a host that
//   understood `ids`, so a requested id absent from it is `missing`.
import { useContext, useMemo } from 'react'
import { QueryClient, QueryClientContext, useQueries } from '@tanstack/react-query'
import { useApi, type ApiClient } from './api-context'
import { onOptionsCacheInvalidated, optionsScope, projectOption, type ResolvedOption } from './use-options-resolver'

export type OptionIdResolution =
    | { status: 'found'; option: ResolvedOption }
    /** The host resolved the ids and this one is not there (deleted, or not visible). */
    | { status: 'missing' }
    /** Could not tell (old host, error): show the raw value. */
    | { status: 'unknown' }

/** Ids the kernel accepts per request (dynamic.MaxOptionsIDs). */
export const OPTION_IDS_CHUNK = 100
const OPTION_IDS_TTL_MS = 30_000
const OPTION_IDS_WINDOW_MS = 5
const QUERY_ROOT = 'metacore-option-ids'

// Hosts without a QueryClientProvider still get dedup + cache.
let fallbackClient: QueryClient | null = null
function getFallbackClient(): QueryClient {
    if (!fallbackClient) fallbackClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return fallbackClient
}

const knownClients = new Set<QueryClient>()
onOptionsCacheInvalidated(() => {
    for (const client of knownClients) void client.invalidateQueries({ queryKey: [QUERY_ROOT] })
})

type Waiter = { resolve: (r: OptionIdResolution) => void }
type Pending = { api: ApiClient; url: string; field: string; waiters: Map<string, Waiter[]> }
const pendingBatches = new Map<string, Pending>()

function enqueue(api: ApiClient, scope: string, url: string, field: string, id: string): Promise<OptionIdResolution> {
    const key = [scope, url, field].join('\n')
    // Keyed without the client: useApi() hands each component its own wrapper
    // of the same host client, and pickers of one ref must share the request.
    let batch = pendingBatches.get(key)
    if (!batch) {
        batch = { api, url, field, waiters: new Map() }
        pendingBatches.set(key, batch)
        const flushing = batch
        setTimeout(() => {
            if (pendingBatches.get(key) === flushing) pendingBatches.delete(key)
            void flush(flushing)
        }, OPTION_IDS_WINDOW_MS)
    }
    const target = batch
    return new Promise((resolve) => {
        const list = target.waiters.get(id) ?? []
        list.push({ resolve })
        target.waiters.set(id, list)
    })
}

async function flush(batch: Pending): Promise<void> {
    const ids = [...batch.waiters.keys()]
    for (let i = 0; i < ids.length; i += OPTION_IDS_CHUNK) {
        const chunk = ids.slice(i, i + OPTION_IDS_CHUNK)
        const result = await fetchIds(batch.api, batch.url, batch.field, chunk)
        for (const id of chunk) {
            const r = result.get(id) ?? { status: 'unknown' as const }
            for (const w of batch.waiters.get(id) ?? []) w.resolve(r)
        }
    }
}

async function fetchIds(api: ApiClient, url: string, field: string, ids: string[]): Promise<Map<string, OptionIdResolution>> {
    const out = new Map<string, OptionIdResolution>()
    try {
        const res = await api.get(url, { params: { field, ids: ids.join(',') } })
        const body = (res as { data: any })?.data
        if (!body || body.success !== true || !Array.isArray(body.data)) return out
        const options = (body.data as unknown[]).map(projectOption)
        const byId = new Map<string, ResolvedOption>()
        for (const o of options) byId.set(String(o.id).toLowerCase(), o)
        const asked = new Set(ids.map((id) => id.toLowerCase()))
        // Only requested ids back → the host honoured `ids`.
        const honoured = options.every((o) => asked.has(String(o.id).toLowerCase()))
        for (const id of ids) {
            const hit = byId.get(id.toLowerCase())
            if (hit) out.set(id, { status: 'found', option: hit })
            else if (honoured) out.set(id, { status: 'missing' })
        }
    } catch {
        // Network / permission error: leave every id `unknown`.
    }
    return out
}

export interface UseResolveOptionIdsArgs {
    /** FK target: `/options/<ref>`. */
    ref?: string
    /** Explicit options endpoint (wins over `ref`), as in useOptionsResolver. */
    endpoint?: string
    /** `?field=`; defaults to `id` with a `ref`. */
    field?: string
    /** Ids to label. Pass only those not already loaded / seeded. */
    ids: readonly (string | number)[]
    enabled?: boolean
}

export interface UseResolveOptionIdsResult {
    /** Settled resolutions by id (as given, stringified). */
    resolved: ReadonlyMap<string, OptionIdResolution>
    /** Some id is still being resolved. */
    loading: boolean
}

export function useResolveOptionIds(args: UseResolveOptionIdsArgs): UseResolveOptionIdsResult {
    const { ref, endpoint, field, ids, enabled = true } = args
    const api = useApi()
    const contextClient = useContext(QueryClientContext)
    const client = contextClient ?? getFallbackClient()
    knownClients.add(client)

    const url = endpoint || (ref ? `/options/${ref}` : '')
    const effectiveField = field || (ref ? 'id' : '')
    const scope = optionsScope()
    const list = useMemo(() => [...new Set(ids.map(String).filter((id) => id !== ''))], [ids.map(String).join('\u0001')])
    const active = enabled && !!url && !!effectiveField && list.length > 0

    const results = useQueries(
        {
            queries: (active ? list : []).map((id) => ({
                queryKey: [QUERY_ROOT, scope, url, effectiveField, id],
                queryFn: () => enqueue(api, scope, url, effectiveField, id),
                staleTime: OPTION_IDS_TTL_MS,
                retry: false,
                refetchOnWindowFocus: false,
            })),
        },
        client,
    )

    const resolved = new Map<string, OptionIdResolution>()
    let loading = false
    if (active) {
        list.forEach((id, i) => {
            const r = results[i]
            if (r?.data) resolved.set(id, r.data)
            else if (r?.isError) resolved.set(id, { status: 'unknown' })
            else loading = true
        })
    }
    return { resolved, loading }
}
