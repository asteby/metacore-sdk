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
 * The hook is intentionally minimal: it does NOT debounce `query`
 * (callers should hold the controlled value and pass it post-debounce)
 * and does NOT cache across hook instances (apps that need shared state
 * compose this with TanStack Query in their own layer).
 */
export function useOptionsResolver(args: UseOptionsResolverArgs): UseOptionsResolverResult {
    const {
        modelKey,
        fieldKey,
        ref,
        query,
        limit,
        enabled = true,
        endpoint,
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

    // Track the in-flight controller so a new fetch can abort the
    // previous one — matters for typeahead callers passing changing `query`.
    const abortRef = useRef<AbortController | null>(null)

    useEffect(() => {
        if (!enabled || !url || !effectiveField) {
            setOptions([])
            setMeta(null)
            setLoading(false)
            setError(null)
            return
        }
        // Cancel any pending request before issuing a new one.
        abortRef.current?.abort()
        const controller = new AbortController()
        abortRef.current = controller

        setLoading(true)
        setError(null)

        const params: Record<string, string | number> = { field: effectiveField }
        if (query) params.q = query
        if (typeof limit === 'number' && limit > 0) params.limit = limit

        api.get(url, { params, signal: controller.signal })
            .then((res) => {
                if (controller.signal.aborted) return
                const body = (res as { data: any }).data
                if (!body || body.success !== true) {
                    throw new Error(body?.message || 'options resolver: unsuccessful response')
                }
                const rawOptions: any[] = Array.isArray(body.data) ? body.data : []
                const projected = rawOptions.map(projectOption)
                setOptions(projected)
                // v0.9.0 envelope: meta.type / meta.count. We tolerate
                // older deployments that still emit a root-level `type`
                // by reading either spot — the projection prefers the
                // canonical location so the SDK guides apps to the new
                // shape without breaking grace-period upgrades.
                const metaPayload =
                    body.meta && typeof body.meta === 'object'
                        ? body.meta
                        : { type: body.type, count: rawOptions.length }
                setMeta({
                    type: metaPayload?.type ?? 'dynamic',
                    count:
                        typeof metaPayload?.count === 'number'
                            ? metaPayload.count
                            : rawOptions.length,
                })
            })
            .catch((err: any) => {
                if (controller.signal.aborted) return
                setError(err instanceof Error ? err : new Error(String(err)))
                setOptions([])
                setMeta(null)
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false)
            })

        return () => {
            controller.abort()
        }
    }, [api, url, effectiveField, query, limit, enabled, refreshKey])

    return {
        options,
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
export function projectOption(raw: any): ResolvedOption {
    const id = raw?.id ?? raw?.value ?? ''
    const label = String(raw?.label ?? raw?.name ?? id ?? '')
    return {
        id,
        value: raw?.value ?? id,
        label,
        name: String(raw?.name ?? label),
        description: raw?.description ?? null,
        image: raw?.image ?? null,
        color: raw?.color ?? null,
        icon: raw?.icon ?? null,
    }
}
