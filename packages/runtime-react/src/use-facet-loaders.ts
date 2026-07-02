// useFacetLoaders — the shared machinery that turns a plain text filter into a
// `facet` value-picker. Both DynamicKanban (via useDynamicFilters) and
// DynamicTable derive their filter configs independently, so the lazy
// per-field option loader + result cache lives here to guarantee they facet
// identically (one board and its table sibling hit the same `/facets` endpoint
// with the same caching).
import { useCallback, useEffect, useRef, useState } from 'react'
import { useApi } from './api-context'
import type { FilterOption } from './dynamic-columns-shim'

export interface UseFacetLoadersResult {
  /**
   * Stable per-field loader → `<facetsBase>?field=&q=&limit=`. Cached per
   * `field+query`. Null `facetsBase` → yields `undefined` (column stays text).
   */
  getFacetLoader: (
    field: string,
  ) => ((q?: string) => Promise<FilterOption[]>) | undefined
  /**
   * Warms the caches for a set of facet fields in ONE parallel burst (called
   * when metadata resolves), so a popover opens instantly with values + counts
   * instead of showing "Cargando…". Deduped by the field set; a field whose
   * request fails is simply omitted (it degrades to lazy/text — the rest are
   * unaffected). Resolved options also land in `facetOptions`.
   */
  prefetchFacets: (fields: string[]) => void
  /** Prefetched options per field (empty until `prefetchFacets` resolves). */
  facetOptions: Map<string, FilterOption[]>
}

/**
 * Long-text / body columns aren't worth faceting (thousands of unique values,
 * each a paragraph). Heuristic on the metadata, not a hardcoded name list:
 * a truncate-text/widget cell or a json/long-text SQL type are the strong
 * signals; the name pattern is only a last-resort fallback.
 */
export function isLongTextColumn(c: {
  key: string
  type?: string
  cellStyle?: string
}): boolean {
  if (c.cellStyle === 'truncate-text' || c.cellStyle === 'widget') return true
  const t = (c.type || '').toLowerCase()
  if (t === 'json' || t === 'long_text' || t === 'text_long' || t === 'widget')
    return true
  return /^(body|description|content|notes?|comment|message|summary)$/i.test(
    c.key,
  )
}

/**
 * Facet option machinery: a stable per-field lazy loader (`getFacetLoader`, with
 * a `field+query` result cache) plus `prefetchFacets` to warm every facet
 * field's values up front and `facetOptions` holding those prewarmed results.
 * Loader identity is memoized per field (so it doesn't churn the config memo
 * that depends on it). Caches reset when `facetsBase` changes (model switch).
 */
export function useFacetLoaders(facetsBase: string | null): UseFacetLoadersResult {
  const api = useApi()
  const loaderCache = useRef<
    Map<string, (q?: string) => Promise<FilterOption[]>>
  >(new Map())
  const resultCache = useRef<Map<string, FilterOption[]>>(new Map())
  const prefetchSig = useRef<string | null>(null)
  const mountedRef = useRef(true)
  const [facetOptions, setFacetOptions] = useState<Map<string, FilterOption[]>>(
    new Map(),
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    loaderCache.current.clear()
    resultCache.current.clear()
    prefetchSig.current = null
    setFacetOptions(new Map())
  }, [facetsBase])

  const getFacetLoader = useCallback(
    (field: string) => {
      if (!facetsBase) return undefined
      const existing = loaderCache.current.get(field)
      if (existing) return existing
      const loader = async (q?: string): Promise<FilterOption[]> => {
        const term = q?.trim() || ''
        const cacheKey = `${field}::${term}`
        const cached = resultCache.current.get(cacheKey)
        if (cached) return cached
        const res = await api.get(facetsBase, {
          params: { field, q: term || undefined, limit: 50 },
        })
        const body = (res as { data: any }).data
        const rows: any[] = body?.success ? body.data || [] : []
        const opts: FilterOption[] = rows.map((r) => ({
          value: String(r.value ?? ''),
          label: String(r.label ?? r.value ?? ''),
          count: typeof r.count === 'number' ? r.count : undefined,
        }))
        resultCache.current.set(cacheKey, opts)
        return opts
      }
      loaderCache.current.set(field, loader)
      return loader
    },
    [api, facetsBase],
  )

  const prefetchFacets = useCallback(
    (fields: string[]) => {
      if (!facetsBase || fields.length === 0) return
      const sig = [...fields].sort().join('|')
      if (prefetchSig.current === sig) return
      prefetchSig.current = sig
      // One parallel burst; the loader seeds its own `${field}::` cache so the
      // subsequent lazy open (q === '') is a cache hit. allSettled so one bad
      // field never blocks the others.
      void Promise.allSettled(
        fields.map(async (field) => {
          const loader = getFacetLoader(field)
          if (!loader) return null
          const opts = await loader()
          return { field, opts }
        }),
      ).then((results) => {
        if (!mountedRef.current) return
        setFacetOptions((prev) => {
          const next = new Map(prev)
          for (const r of results) {
            if (r.status === 'fulfilled' && r.value) {
              next.set(r.value.field, r.value.opts)
            }
          }
          return next
        })
      })
    },
    [facetsBase, getFacetLoader],
  )

  return { getFacetLoader, prefetchFacets, facetOptions }
}
