// useDynamicFilters — the metadata-driven filter engine shared by DynamicTable
// and DynamicKanban. It owns nothing view-specific: given a model's
// `TableMetadata`, it derives the per-field filter configs (from
// `metadata.filters[]` + every `metadata.columns[].filterable` column),
// prefetches the server-side option lists for relation/select filters, tracks
// the selected values + global search, and serializes them into the exact
// `f_<key>=<op>:<value>` / `search` query params the `/data/:model` endpoint
// already understands.
//
// DynamicTable historically inlined this; DynamicKanban now needs the SAME
// filtering (RFC: a board is just another view of the model), so the logic is
// factored here to guarantee both surfaces filter identically.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApi } from './api-context'
import { DATE_CELL_TYPES } from './dynamic-columns'
import { getSearchableColumnKeys } from './column-visibility'
import { useFacetLoaders, isLongTextColumn } from './use-facet-loaders'
import type { ColumnFilterConfig, FilterOption } from './dynamic-columns-shim'
import type { TableMetadata } from './types'

export interface UseDynamicFiltersOptions {
  /**
   * Static equality filters always applied (never shown as removable chips).
   * Mirrors DynamicTable's `defaultFilters` — e.g. scoping a board to one owner.
   */
  defaultFilters?: Record<string, any>
  /**
   * Model key used to derive the per-field `facets` endpoint
   * (`/data/<model>/facets`) that upgrades plain text filters into value
   * pickers. Omit (or pass `facetsEndpoint`) to keep text filters as bare
   * "Contiene..." boxes.
   */
  model?: string
  /**
   * Explicit `facets` endpoint override — wins over the `model`-derived path.
   * The loader appends `?field=<key>&q=<text>&limit=50`.
   */
  facetsEndpoint?: string
}

export interface UseDynamicFiltersResult {
  /** Per-field selected values, `filterKey → values[]` (empty = inactive). */
  dynamicFilters: Record<string, string[]>
  /** Free-text search term (the toolbar search box). */
  globalFilter: string
  setGlobalFilter: (v: string) => void
  /** Config for each filterable field, keyed by the metadata filter/column key. */
  columnFilterConfigs: Map<string, ColumnFilterConfig>
  /**
   * The serialized query params (`f_<key>`, `search`, `search_columns`) ready to
   * spread into a `/data/:model` request. Stable object identity while inputs
   * are unchanged so a consumer can safely depend on it in a fetch effect.
   */
  filterParams: Record<string, any>
  /** Apply a field's selection (replaces its values). */
  handleDynamicFilterChange: (filterKey: string, values: string[]) => void
  /** Count of fields with an active selection + the search term. */
  activeFilterCount: number
  /** Clear every field filter and the search term. */
  clearAll: () => void
}

/**
 * Reads the model's filter metadata and returns the live filter state + the
 * serialized request params. Pure of any view concern — DynamicTable adds its
 * own sort/pagination/`columnFilters`; DynamicKanban spreads `filterParams`
 * straight onto its single-page fetch.
 */
export function useDynamicFilters(
  metadata: TableMetadata | null,
  opts: UseDynamicFiltersOptions = {},
): UseDynamicFiltersResult {
  const { defaultFilters, model, facetsEndpoint } = opts
  const api = useApi()

  const [dynamicFilters, setDynamicFilters] = useState<Record<string, string[]>>({})
  const [globalFilter, setGlobalFilter] = useState('')
  const [filterOptionsMap, setFilterOptionsMap] = useState<
    Map<string, FilterOption[]>
  >(new Map())

  // Where a `facet` filter loads its distinct values from. Explicit endpoint
  // wins; otherwise derive it from the model. Null → text filters stay plain.
  const facetsBase = facetsEndpoint ?? (model ? `/data/${model}/facets` : null)
  const getFacetLoader = useFacetLoaders(facetsBase)

  // Prefetch the option lists for relation/select filters (once per model). The
  // combobox needs these before the user opens it; mirrors DynamicTable's
  // metadata-init option prefetch, narrowed to the FILTER endpoints only (the
  // kanban renders card cells through ActivityValueRenderer, not the cell
  // options map, so we skip that half).
  const prefetchedSig = useRef<string | null>(null)
  useEffect(() => {
    if (!metadata) return
    const filterEndpoints = (metadata.filters || [])
      .filter(
        (f) =>
          f.searchEndpoint &&
          (f.type === 'select' ||
            f.type === 'dynamic_select' ||
            f.type === 'boolean'),
      )
      .map((f) => f.searchEndpoint!)
    const columnFilterEndpoints = (metadata.columns || [])
      .filter((c) => c.filterable && c.searchEndpoint)
      .map((c) => c.searchEndpoint!)
    const endpoints = Array.from(
      new Set([...filterEndpoints, ...columnFilterEndpoints]),
    )
    if (endpoints.length === 0) return
    // Dedup on the endpoint set, not model identity (TableMetadata carries no
    // name) — the same board re-rendering shouldn't refetch its options.
    const sig = endpoints.join('|')
    if (prefetchedSig.current === sig) return
    prefetchedSig.current = sig

    let cancelled = false
    Promise.all(
      endpoints.map(async (ep) => {
        try {
          const res = await api.get(ep)
          return {
            endpoint: ep,
            data: res.data?.success ? res.data.data : [],
          }
        } catch (e) {
          console.error(`Failed to fetch filter options for ${ep}`, e)
          return { endpoint: ep, data: [] as any[] }
        }
      }),
    ).then((results) => {
      if (cancelled) return
      const fMap = new Map<string, FilterOption[]>()
      for (const r of results) {
        fMap.set(
          r.endpoint,
          (r.data || []).map((item: any) => ({
            label: item.label || item.name || '',
            value: String(item.value ?? item.id ?? ''),
            icon: item.icon,
            color: item.color || item.class,
          })),
        )
      }
      setFilterOptionsMap(fMap)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metadata])

  const handleDynamicFilterChange = useCallback(
    (filterKey: string, values: string[]) => {
      setDynamicFilters((prev) => ({ ...prev, [filterKey]: values }))
    },
    [],
  )

  const clearAll = useCallback(() => {
    setDynamicFilters({})
    setGlobalFilter('')
  }, [])

  // Derive one ColumnFilterConfig per filterable field. Explicit
  // `metadata.filters[]` wins; otherwise every `filterable` column yields a
  // config with its UI inferred from the column shape. Copied 1:1 from
  // DynamicTable so table and board build identical configs.
  const columnFilterConfigs = useMemo(() => {
    const map = new Map<string, ColumnFilterConfig>()
    if (!metadata) return map
    const stages = metadata.stages ?? []
    const groupBy = metadata.group_by
    // Stage options derived once from the pipeline machine, reused wherever a
    // stage column has no inline options of its own (A).
    const stageOptions: FilterOption[] = stages.map((s) => ({
      label: s.label,
      value: s.key,
      color: s.color,
    }))

    for (const f of metadata.filters ?? []) {
      let fType = f.type as ColumnFilterConfig['filterType']
      let options: FilterOption[] = []
      if (f.options && f.options.length > 0) {
        options = f.options.map((o) => ({
          label: o.label,
          value: String(o.value),
          icon: o.icon,
          color: o.color,
        }))
      }
      if (f.searchEndpoint && filterOptionsMap.has(f.searchEndpoint)) {
        options = filterOptionsMap.get(f.searchEndpoint) || []
      }
      // (A) Stage column with no options of its own → project the pipeline
      // stages (with their colors) into a real select instead of leaving it as
      // a text box.
      if (
        options.length === 0 &&
        !f.searchEndpoint &&
        (f.column || f.key) === groupBy &&
        stageOptions.length > 0
      ) {
        fType = 'select'
        options = stageOptions
      }
      // (B) A plain text filter becomes a facet value-picker when a facets
      // endpoint is available.
      let loadOptions: ColumnFilterConfig['loadOptions']
      if (fType === 'text' && facetsBase) {
        const loader = getFacetLoader(f.column || f.key)
        if (loader) {
          fType = 'facet'
          loadOptions = loader
        }
      }
      if (fType === 'select' && options.length === 0 && !f.searchEndpoint) continue
      map.set(f.key, {
        filterType: fType,
        filterKey: f.column || f.key,
        options,
        selectedValues: dynamicFilters[f.column || f.key] || [],
        onFilterChange: handleDynamicFilterChange,
        loading: f.searchEndpoint ? !filterOptionsMap.has(f.searchEndpoint) : false,
        searchEndpoint: f.searchEndpoint,
        loadOptions,
      })
    }
    for (const c of metadata.columns ?? []) {
      if (!c.filterable || map.has(c.key)) continue
      const hasStaticOptions = (c.options?.length ?? 0) > 0
      const hasEndpoint = !!c.searchEndpoint
      const isRelation = !!c.ref || c.filterType === 'dynamic_select'
      // (A) A stage column with no options of its own inherits the pipeline's
      // stages — so "Stage" becomes a colored select, not a text box.
      const isStageColumn =
        c.key === groupBy &&
        !hasStaticOptions &&
        !hasEndpoint &&
        !c.filterType &&
        stageOptions.length > 0
      let filterType: ColumnFilterConfig['filterType']
      if (isStageColumn) filterType = 'select'
      else if (c.filterType) filterType = c.filterType
      else if (isRelation && hasEndpoint) filterType = 'dynamic_select'
      else if (hasStaticOptions || hasEndpoint) filterType = 'select'
      else if (c.type === 'boolean') filterType = 'boolean'
      else if (c.type === 'number') filterType = 'number_range'
      else if ((DATE_CELL_TYPES as readonly string[]).includes(c.type))
        filterType = 'date_range'
      else filterType = 'text'

      let options = hasStaticOptions
        ? c.options!.map((o) => ({
            label: o.label,
            value: String(o.value),
            icon: o.icon,
            color: o.color,
          }))
        : hasEndpoint && filterOptionsMap.has(c.searchEndpoint!)
          ? filterOptionsMap.get(c.searchEndpoint!) || []
          : []
      if (isStageColumn) options = stageOptions

      // (B) Upgrade a plain text filter to a facet value-picker (unless it's a
      // long-text/body column — too many unique values to enumerate).
      let loadOptions: ColumnFilterConfig['loadOptions']
      if (filterType === 'text' && facetsBase && !isLongTextColumn(c)) {
        const loader = getFacetLoader(c.key)
        if (loader) {
          filterType = 'facet'
          loadOptions = loader
        }
      }

      map.set(c.key, {
        filterType,
        filterKey: c.key,
        options,
        selectedValues: dynamicFilters[c.key] || [],
        onFilterChange: handleDynamicFilterChange,
        loading: hasEndpoint && !filterOptionsMap.has(c.searchEndpoint!),
        searchEndpoint: c.searchEndpoint,
        loadOptions,
      })
    }
    return map
  }, [
    metadata,
    filterOptionsMap,
    dynamicFilters,
    handleDynamicFilterChange,
    facetsBase,
    getFacetLoader,
  ])

  const searchableKeys = useMemo(
    () => (metadata ? getSearchableColumnKeys(metadata) : null),
    [metadata],
  )

  // Serialize to `/data/:model` query params — identical operator encoding to
  // DynamicTable.buildFilterParams (IN:/RANGE:/GTE:/LTE:/ILIKE:/plain).
  const filterParams = useMemo(() => {
    const params: Record<string, any> = {}
    if (globalFilter) {
      if (searchableKeys === null) {
        params.search = globalFilter
      } else if (searchableKeys.length > 0) {
        params.search = globalFilter
        params.search_columns = searchableKeys.join(',')
      }
      // searchableKeys === [] → no searchable column, skip the search param.
    }
    if (defaultFilters) {
      Object.entries(defaultFilters).forEach(([key, value]) => {
        params[`f_${key}`] = value
      })
    }
    Object.entries(dynamicFilters).forEach(([key, values]) => {
      if (values.length === 0) return
      const gteVal = values.find((v) => v.startsWith('GTE:'))
      const lteVal = values.find((v) => v.startsWith('LTE:'))
      if (gteVal || lteVal) {
        const min = gteVal ? gteVal.replace('GTE:', '') : ''
        const max = lteVal ? lteVal.replace('LTE:', '') : ''
        params[`f_${key}`] = `RANGE:${min},${max}`
        return
      }
      if (values.length === 1) params[`f_${key}`] = values[0]
      else params[`f_${key}`] = `IN:${values.join(',')}`
    })
    return params
  }, [globalFilter, searchableKeys, defaultFilters, dynamicFilters])

  const activeFilterCount = useMemo(() => {
    let n = Object.values(dynamicFilters).filter((v) => v.length > 0).length
    if (globalFilter) n += 1
    return n
  }, [dynamicFilters, globalFilter])

  return {
    dynamicFilters,
    globalFilter,
    setGlobalFilter,
    columnFilterConfigs,
    filterParams,
    handleDynamicFilterChange,
    activeFilterCount,
    clearAll,
  }
}
