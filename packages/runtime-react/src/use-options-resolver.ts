// useOptionsResolver — single hook the SDK uses to fetch select options
// for a metadata-driven field. Replaces the ad-hoc `/data/<model>` reads
// that DynamicForm and DynamicRelation used to do.
//
// Contract (matches kernel ≥ v0.9.0):
//   GET /api/options/:model?field=<key>&q=<text>&limit=<n>
//   →  { success: true, data: Option[], meta: { type: 'static'|'dynamic', count } }
//
// The hook prefers `ColumnDef.Ref` (auto-derived by the kernel from
// belongs_to relations) over a hand-wired `searchEndpoint`. Apps that
// adopt Ref via the kernel auto-derivation get the right behaviour for
// free; legacy callers that still ship `searchEndpoint` keep working.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApi } from './api-context'
import { applyOptionFilter, type OptionFilterRule } from './option-filter'
import { loadQueryPart, optionsBatchToken, optionsModelFromUrl } from './query-batch'

export interface ResolvedOption {
    /** Canonical id (server-side primary key). */
    id: string | number
    /** Same as `id` — preserved for legacy frontend parity. */
    value: string | number
    /** Display string. */
    label: string
    /** Same as `label` — preserved for legacy frontend parity. */
    name: string
    description?: string | null
    image?: string | null
    color?: string | null
    icon?: string | null
    /**
     * Campos extra del payload (precio, costo, sku, tasa) que no son decoración.
     * Solo se llena cuando el option trae números o strings además de id/label.
     */
    meta?: Record<string, unknown>
}

export interface OptionsMeta {
    /** 'static' for inline options, 'dynamic' for FK-resolved lists. */
    type: 'static' | 'dynamic' | string
    /** Number of options the server returned in this batch. */
    count: number
}

export interface UseOptionsResolverArgs {
    /**
     * The owning model whose options endpoint is queried. Pass the model
     * key (e.g. 'sales_orders'). Required — passing an empty string puts
     * the hook in idle mode and no fetch fires.
     */
    modelKey: string
    /**
     * Field on `modelKey` to resolve. Maps to `?field=<fieldKey>`.
     */
    fieldKey: string
    /**
     * Optional FK target. When set the hook resolves against
     * `/api/options/<ref>?field=id` instead of `/api/options/<modelKey>`.
     * This is the canonical path the kernel auto-derives from
     * `ColumnDef.Ref`. Prefer this over `endpoint`.
     */
    ref?: string
    /**
     * Free-text query forwarded as `?q=`. Empty values are skipped so the
     * server returns the first page unfiltered.
     */
    query?: string
    /**
     * Cascade scope forwarded as `?filter_value=`. Set by a dependent picker
     * from the current value of the field it `dependsOn` (e.g. a product
     * picker scoped to the header's `source_warehouse_id`). When empty/undefined
     * the param is omitted (no scope — the picker lists everything). Changing it
     * re-fetches; an empty string is treated as "not set" so a cleared parent
     * does not query for the empty-string scope.
     */
    filterValue?: string
    /**
     * Server-side pagination cap. Defaults to 50 (kernel
     * DefaultOptionsLimit) if omitted.
     */
    limit?: number
    /**
     * Toggle to disable fetching entirely (e.g. while a parent row is
     * still loading). Defaults to true.
     */
    enabled?: boolean
    /**
     * Escape hatch for callers that need a non-canonical URL — e.g.
     * legacy `/options/<custom>?...`. When set it overrides `ref` and
     * `modelKey` for the fetch path. The query string is built from
     * `fieldKey` / `query` / `limit` exactly the same way.
     */
    endpoint?: string
    /**
     * Client-side rules that hide fetched options (see `option-filter.ts`).
     * Empty/undefined → no filtering (retrocompat).
     */
    optionFilter?: OptionFilterRule[]
    /** Current selection: never hidden by `optionFilter`, so its label survives. */
    keepValue?: unknown
}

export interface UseOptionsResolverResult {
    options: ResolvedOption[]
    meta: OptionsMeta | null
    loading: boolean
    error: Error | null
    /** Forces a refetch. Useful after a parent record updates. */
    refetch: () => void
}

/**
 * Resolves select options for a field via the canonical
 * `/api/options/:model?field=…` endpoint. Returns the v0.9.0 envelope
 * `{ data, meta: { type, count } }` projected into a stable shape.
 *
 * The hook does NOT debounce `query` (callers should pass it post-debounce).
 * Identical lookups share one in-flight request and a 30s cache, so a column
 * of reference cells does not fan out one request per row. The key includes
 * the org and branch from the host session.
 */
const OPTIONS_TTL_MS = 30_000

type OptionsPayload = { options: ResolvedOption[]; meta: OptionsMeta }

const optionsCache = new Map<string, { payload: OptionsPayload; at: number }>()
const optionsInflight = new Map<string, Promise<OptionsPayload>>()
const optionsEpoch = new Map<string, number>()
// Bumped by invalidateOptionsCache: a lookup that started before a write must
// not store what it read.
let optionsGeneration = 0

/**
 * Forgets every cached and in-flight options lookup. Called after any write
 * (create, edit, delete), so a picker opened right after creating a record
 * lists it instead of serving the previous 30 s snapshot.
 */
export function invalidateOptionsCache(): void {
    optionsGeneration++
    optionsCache.clear()
    optionsInflight.clear()
    for (const fn of invalidationListeners) fn()
}

const invalidationListeners = new Set<() => void>()

/** Runs `fn` on every invalidateOptionsCache (id-label lookups drop with it). */
export function onOptionsCacheInvalidated(fn: () => void): () => void {
    invalidationListeners.add(fn)
    return () => invalidationListeners.delete(fn)
}

export function optionsRequestKey(
    scope: string,
    url: string,
    field: string,
    query: string,
    limit: number | undefined,
    filter: string | undefined,
): string {
    return [scope, url, field, query, String(limit ?? ''), filter ?? ''].join('\n')
}

/** Org + branch of the host session: part of every options cache key. */
export function optionsScope(): string {
    if (typeof localStorage === 'undefined') return ''
    let org = ''
    try {
        const raw = localStorage.getItem('auth_user')
        if (raw) org = String((JSON.parse(raw) as { organization_id?: string }).organization_id ?? '')
    } catch {
        org = ''
    }
    const branch = localStorage.getItem('active_branch_id') ?? ''
    return `${org}|${branch}`
}

function readOptionsEnvelope(body: any): OptionsPayload {
    const rawOptions: any[] = Array.isArray(body?.data) ? body.data : []
    const metaPayload =
        body?.meta && typeof body.meta === 'object'
            ? body.meta
            : { type: body?.type, count: rawOptions.length }
    return {
        options: rawOptions.map(projectOption),
        meta: {
            type: metaPayload?.type ?? 'dynamic',
            count: typeof metaPayload?.count === 'number' ? metaPayload.count : rawOptions.length,
        },
    }
}

export function useOptionsResolver(args: UseOptionsResolverArgs): UseOptionsResolverResult {
    const {
        modelKey,
        fieldKey,
        ref,
        query,
        limit,
        enabled = true,
        endpoint,
        filterValue,
        optionFilter,
        keepValue,
    } = args

    const api = useApi()
    const [options, setOptions] = useState<ResolvedOption[]>([])
    const [meta, setMeta] = useState<OptionsMeta | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<Error | null>(null)
    // refreshKey is bumped by `refetch` to force the effect to re-run
    // even when none of the input args changed.
    const [refreshKey, setRefreshKey] = useState(0)

    // The URL the hook hits. Ref wins over modelKey because the kernel's
    // auto-derivation makes ref the canonical pointer; a manual endpoint
    // wins over both as the explicit override.
    const url = useMemo(() => {
        if (endpoint) return endpoint
        if (ref) return `/options/${ref}`
        if (!modelKey) return ''
        return `/options/${modelKey}`
    }, [endpoint, ref, modelKey])

    // The field to query. When using `ref` the canonical lookup field is
    // `id` (FK targets the target model's PK), unless the caller wants
    // to override that explicitly via `fieldKey`. We only inject the `id`
    // default when `ref` is set AND `fieldKey` is empty.
    const effectiveField = useMemo(() => {
        if (fieldKey) return fieldKey
        if (ref) return 'id'
        return ''
    }, [fieldKey, ref])

    const seenRefresh = useRef(0)

    useEffect(() => {
        if (!enabled || !url || !effectiveField) {
            setOptions([])
            setMeta(null)
            setLoading(false)
            setError(null)
            return
        }

        const key = optionsRequestKey(
            optionsScope(),
            url,
            effectiveField,
            query ?? '',
            limit,
            filterValue,
        )
        if (refreshKey !== seenRefresh.current) {
            seenRefresh.current = refreshKey
            optionsEpoch.set(key, (optionsEpoch.get(key) ?? 0) + 1)
            optionsCache.delete(key)
            optionsInflight.delete(key)
        }
        const epoch = optionsEpoch.get(key) ?? 0
        const generation = optionsGeneration
        const cached = optionsCache.get(key)
        if (cached && Date.now() - cached.at < OPTIONS_TTL_MS) {
            setOptions(cached.payload.options)
            setMeta(cached.payload.meta)
            setLoading(false)
            setError(null)
            return
        }

        setLoading(true)
        setError(null)

        let pending = optionsInflight.get(key)
        if (!pending) {
            const params: Record<string, string | number> = { field: effectiveField }
            if (query) params.q = query
            if (typeof limit === 'number' && limit > 0) params.limit = limit
            if (filterValue) params.filter_value = filterValue
            const model = optionsModelFromUrl(url)
            pending = (async () => {
                if (model) {
                    try {
                        const part = await loadQueryPart(
                            api,
                            optionsBatchToken(model, effectiveField, query ?? '', limit, filterValue),
                        )
                        if (!part.success) {
                            throw new Error(part.message || 'options resolver: unsuccessful response')
                        }
                        const payload = readOptionsEnvelope({
                            success: true,
                            data: part.data,
                            meta: part.meta,
                        })
                        if ((optionsEpoch.get(key) ?? 0) === epoch && optionsGeneration === generation) {
                            optionsCache.set(key, { payload, at: Date.now() })
                        }
                        return payload
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : ''
                        const batchMiss = msg === 'batch unavailable' || msg === 'batch part missing'
                        if (!batchMiss) throw err
                    }
                }
                const res = await api.get(url, { params })
                const body = (res as { data: any }).data
                if (!body || body.success !== true) {
                    throw new Error(body?.message || 'options resolver: unsuccessful response')
                }
                const payload = readOptionsEnvelope(body)
                if ((optionsEpoch.get(key) ?? 0) === epoch && optionsGeneration === generation) {
                    optionsCache.set(key, { payload, at: Date.now() })
                }
                return payload
            })().finally(() => {
                if (optionsInflight.get(key) === pending) optionsInflight.delete(key)
            })
            optionsInflight.set(key, pending)
        }

        let cancelled = false
        pending
            .then((payload) => {
                if (cancelled) return
                setOptions(payload.options)
                setMeta(payload.meta)
            })
            .catch((err: any) => {
                if (cancelled) return
                setError(err instanceof Error ? err : new Error(String(err)))
                setOptions([])
                setMeta(null)
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [api, url, effectiveField, query, limit, enabled, filterValue, refreshKey])

    // Rules arrive as a fresh array each render; key on their content.
    const filterKey = optionFilter && optionFilter.length > 0 ? JSON.stringify(optionFilter) : ''
    const visibleOptions = useMemo(
        () => (filterKey ? applyOptionFilter(options, optionFilter ?? [], keepValue) : options),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [options, filterKey, keepValue],
    )

    return {
        options: visibleOptions,
        meta,
        loading,
        error,
        refetch: () => setRefreshKey((k) => k + 1),
    }
}

/**
 * Normalizes the wire shape into ResolvedOption. The kernel returns dual
 * id/value and label/name fields for legacy parity — we accept either
 * and surface a stable shape downstream.
 */
const OPTION_KNOWN_KEYS = new Set(['id', 'value', 'label', 'name', 'description', 'image', 'color', 'icon'])

export function projectOption(raw: any): ResolvedOption {
    const id = raw?.id ?? raw?.value ?? ''
    const label = String(raw?.label ?? raw?.name ?? id ?? '')
    const meta: Record<string, unknown> = {}
    if (raw && typeof raw === 'object') {
        for (const [k, v] of Object.entries(raw)) {
            if (OPTION_KNOWN_KEYS.has(k)) continue
            if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') meta[k] = v
        }
    }
    return {
        id,
        value: raw?.value ?? id,
        label,
        name: String(raw?.name ?? label),
        description: raw?.description ?? null,
        image: raw?.image ?? null,
        color: raw?.color ?? null,
        icon: raw?.icon ?? null,
        ...(Object.keys(meta).length > 0 ? { meta } : {}),
    }
}
