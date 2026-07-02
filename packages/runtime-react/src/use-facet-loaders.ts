// useFacetLoaders — the shared machinery that turns a plain text filter into a
// `facet` value-picker. Both DynamicKanban (via useDynamicFilters) and
// DynamicTable derive their filter configs independently, so the lazy
// per-field option loader + result cache lives here to guarantee they facet
// identically (one board and its table sibling hit the same `/facets` endpoint
// with the same caching).
import { useCallback, useEffect, useRef } from 'react'
import { useApi } from './api-context'
import type { FilterOption } from './dynamic-columns-shim'

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
 * Returns `getFacetLoader(field)` — a stable per-field loader that resolves the
 * column's distinct values + counts from `<facetsBase>?field=&q=&limit=`. Loader
 * identity is memoized per field (so it doesn't churn the config memo that
 * depends on it) and results are cached per `field+query`. Both caches reset
 * when `facetsBase` changes (model switch). A null `facetsBase` returns a
 * factory that yields `undefined` — the caller keeps the column as plain text.
 */
export function useFacetLoaders(facetsBase: string | null) {
  const api = useApi()
  const loaderCache = useRef<
    Map<string, (q?: string) => Promise<FilterOption[]>>
  >(new Map())
  const resultCache = useRef<Map<string, FilterOption[]>>(new Map())

  useEffect(() => {
    loaderCache.current.clear()
    resultCache.current.clear()
  }, [facetsBase])

  return useCallback(
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
}
