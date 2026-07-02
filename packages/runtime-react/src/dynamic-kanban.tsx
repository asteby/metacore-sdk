// DynamicKanban — the `view_type: "kanban"` renderer, a sibling of
// `DynamicTable`. Given the SAME contract (model + endpoint + injected
// ApiProvider), it fetches the model's metadata + records, groups the records
// into board lanes by the `group_by` stage column, and lets the user drag a
// card between lanes.
//
// Reuse, not reinvention:
//   - Metadata + records come through the same `useApi()` client and the same
//     `/metadata/table/:model` + `/data/:model` endpoints as DynamicTable.
//   - Card fields render through `ActivityValueRenderer`, the existing pure
//     single-value renderer that mirrors `defaultGetDynamicColumns`' display
//     logic (currency, status, date, relation chip, …) — so a card cell and a
//     table cell look identical.
//   - Per-card actions reuse `resolveRowActions` (capability-gated, same as the
//     table's action column) + `useDynamicRowActions`, the EXACT shared handler
//     DynamicTable's row menu dispatches through (view/edit/delete/link/custom).
//
// The one thing it owns that the table doesn't: an OPTIMISTIC drag-to-move.
// Dropping a card into another lane mutates local state immediately and fires
// `PUT /data/:model/me/:id { <group_by>: <destStage> }`; if the request fails
// the move is reverted and a toast surfaces. This sidesteps the "refetch loses
// scroll/selection" gap a naive re-query would introduce.
//
// Transitions: when the metadata carries `transitions[]`, a card may only be
// dropped into a lane reachable from its current stage. Disallowed lanes dim
// while dragging and reject the drop.
import * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    useDraggable,
    useDroppable,
    type DragStartEvent,
    type DragEndEvent,
} from '@dnd-kit/core'
import {
    Calendar,
    CircleDot,
    Hash,
    ListFilter,
    MoreHorizontal,
    Search,
    Tag,
    ToggleLeft,
    Type,
    X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
    Badge,
    Button,
    Card,
    CardContent,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Input,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
    Skeleton,
} from '@asteby/metacore-ui/primitives'
import { ColumnFilterControl, FilterValueCombobox, type ColumnFilterType } from '@asteby/metacore-ui/data-table'
import { generateBadgeStyles, optionColor } from '@asteby/metacore-ui/lib'
import { useApi } from './api-context'
import { useDynamicFilters } from './use-dynamic-filters'
import {
    FilterChipsRow,
    summarizeFilterValues,
    translateOptionLabels,
} from './filter-chips'
import { dedupeById, useInfiniteScrollSentinel } from './use-infinite-scroll'
import { useMetadataCache } from './metadata-cache'
import { ActivityValueRenderer } from './activity-value-renderer'
import { DynamicIcon } from './dynamic-icon'
import { isColumnVisibleInTable } from './column-visibility'
import { isRowActionVisible } from './dynamic-columns'
import { useCan, usePermissionsActive, resolveRowActions } from './permissions-context'
import { useDynamicRowActions } from './dynamic-row-actions'
import type {
    TableMetadata,
    ColumnDefinition,
    ApiResponse,
    ActionDefinition,
    StageMeta,
    StageTransition,
} from './types'

// Re-exported for tests + backward-compat: these live in ./filter-chips now
// (shared with DynamicTable) but were historically imported from here.
export { summarizeFilterValues, translateOptionLabels }

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests — no React, no transport)
// ---------------------------------------------------------------------------

/**
 * Resolves the board lanes for a kanban view. Prefers the model-level
 * `metadata.stages` (the kernel's `stages[]`); falls back to the `group_by`
 * column's `options` (the kernel projects the stage machine onto the status
 * display). Returns lanes sorted by `order` (then declared order). Empty when
 * neither source is present — the caller renders a "no stages" notice.
 */
export function deriveStages(metadata: TableMetadata): StageMeta[] {
    const fromMeta = metadata.stages
    if (fromMeta && fromMeta.length > 0) {
        return [...fromMeta].sort(sortByOrder)
    }
    const groupBy = metadata.group_by
    if (!groupBy) return []
    const col = metadata.columns.find((c) => c.key === groupBy)
    const opts = col?.options ?? []
    return opts.map((o, i) => ({
        key: String(o.value),
        label: o.label,
        color: o.color,
        order: i,
    }))
}

function sortByOrder(a: StageMeta, b: StageMeta): number {
    const ao = a.order ?? Number.MAX_SAFE_INTEGER
    const bo = b.order ?? Number.MAX_SAFE_INTEGER
    return ao - bo
}

/**
 * Buckets records into a `stageKey → rows[]` map, one entry per declared stage
 * (in stage order), plus a trailing `__unassigned__` bucket for rows whose
 * stage value matches no declared lane (so nothing silently vanishes). Empty
 * lanes are kept so the board always shows every stage.
 */
export const UNASSIGNED_LANE = '__unassigned__'

export function groupByStage(
    records: any[],
    groupByKey: string,
    stages: StageMeta[],
): Map<string, any[]> {
    const map = new Map<string, any[]>()
    for (const s of stages) map.set(s.key, [])
    const known = new Set(stages.map((s) => s.key))
    for (const row of records) {
        const raw = row?.[groupByKey]
        const key = raw === null || raw === undefined ? '' : String(raw)
        if (known.has(key)) {
            map.get(key)!.push(row)
        } else {
            if (!map.has(UNASSIGNED_LANE)) map.set(UNASSIGNED_LANE, [])
            map.get(UNASSIGNED_LANE)!.push(row)
        }
    }
    return map
}

/**
 * Whether a card may move `from → to` given the declared transitions. No
 * transitions declared → unrestricted (the kernel still validates server-side).
 * A move to the same stage is always a no-op "allowed". `'*'` is a wildcard on
 * either side.
 */
export function isTransitionAllowed(
    transitions: StageTransition[] | undefined,
    from: string,
    to: string,
): boolean {
    if (from === to) return true
    if (!transitions || transitions.length === 0) return true
    return transitions.some(
        (t) =>
            (t.from === from || t.from === '*') && (t.to === to || t.to === '*'),
    )
}

/**
 * Returns a NEW grouping with `cardId` moved from `fromStage` to `toStage`
 * (appended to the destination lane). Pure — does not mutate the input map.
 * Used by the optimistic drop handler so the board updates before the PUT
 * resolves, and so the previous grouping can be restored on failure.
 */
export function applyOptimisticMove(
    grouped: Map<string, any[]>,
    cardId: string | number,
    fromStage: string,
    toStage: string,
    groupByKey: string,
): Map<string, any[]> {
    const next = new Map<string, any[]>()
    for (const [k, rows] of grouped) next.set(k, [...rows])
    const fromRows = next.get(fromStage) ?? []
    const idx = fromRows.findIndex((r) => String(r.id) === String(cardId))
    if (idx === -1) return next
    const [moved] = fromRows.splice(idx, 1)
    const updated = { ...moved, [groupByKey]: toStage }
    const toRows = next.get(toStage) ?? []
    toRows.push(updated)
    next.set(toStage, toRows)
    return next
}

/**
 * Returns a NEW per-lane pagination map with the server totals adjusted for a
 * card moving `fromStage` → `toStage`: the source loses one, the destination
 * gains one. Lanes whose `total` is still unknown (`null`, not yet topped up)
 * are left alone. Pure — backs the optimistic drag so a partial lane's
 * `count/total` header stays truthful, and can be restored on PUT failure.
 */
export function applyLaneTotalsOnMove<T extends { total: number | null }>(
    pagination: Record<string, T>,
    fromStage: string,
    toStage: string,
): Record<string, T> {
    const next = { ...pagination }
    const bump = (key: string, delta: number) => {
        const st = next[key]
        if (st && st.total != null) {
            next[key] = { ...st, total: Math.max(0, st.total + delta) }
        }
    }
    bump(fromStage, -1)
    bump(toStage, +1)
    return next
}

/**
 * Picks the columns shown on a card: a `title` column (first searchable column,
 * else first text-ish column) and up to `maxFields` secondary columns. Excludes
 * the group_by column (it's the lane itself) and any column hidden from the
 * table view (visibility modal/list, or `hidden`).
 */
export function selectCardColumns(
    metadata: TableMetadata,
    maxFields = 3,
): { title: ColumnDefinition | null; fields: ColumnDefinition[] } {
    const groupBy = metadata.group_by
    const visible = metadata.columns.filter(
        (c) =>
            c.key !== groupBy &&
            !c.hidden &&
            isColumnVisibleInTable(c) &&
            c.key !== 'id',
    )
    const title =
        visible.find((c) => c.searchable) ??
        visible.find((c) => c.type === 'text' || c.cellStyle === 'truncate-text') ??
        visible[0] ??
        null
    const fields = visible
        .filter((c) => c.key !== title?.key)
        .slice(0, maxFields)
    return { title, fields }
}

/**
 * Whether a card passes a lane funnel. Picked select/facet `values` match by
 * equality (IN — the card's field value must be one of them); a free-text
 * `text` matches by case-insensitive substring. No field / no criteria → passes.
 * Pure — exported for unit tests.
 */
export function cardMatchesLaneFunnel(
    card: any,
    filter: { field?: string; values?: string[]; text?: string } | undefined,
): boolean {
    if (!filter?.field) return true
    const raw = String(card?.[filter.field] ?? '')
    if (filter.values && filter.values.length > 0) {
        return filter.values.includes(raw)
    }
    if (filter.text?.trim()) {
        return raw.toLowerCase().includes(filter.text.trim().toLowerCase())
    }
    return true
}

/**
 * Count of applied criteria on a lane funnel: the number of picked select/facet
 * `values`, else 1 for a free-text `text`, else 0. Drives the funnel's count
 * badge. Pure — exported for unit tests.
 */
export function laneFunnelCount(
    value: { values?: string[]; text?: string } | undefined,
): number {
    if (value?.values?.length) return value.values.length
    if (value?.text?.trim()) return 1
    return 0
}

/**
 * Whether a card matches a free-text lane search: a case-insensitive substring
 * over the card's title + every visible field value (`String(v)`). Empty query
 * matches everything. Pure — exported for unit tests.
 */
export function cardMatchesLaneQuery(
    card: any,
    cols: ColumnDefinition[],
    query: string,
): boolean {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return cols.some((c) =>
        String(card?.[c.key] ?? '')
            .toLowerCase()
            .includes(q),
    )
}

// ---------------------------------------------------------------------------
// Theme hook (mirrors the private one in dynamic-columns / activity-renderer)
// ---------------------------------------------------------------------------

function useIsDarkTheme(): boolean {
    const [isDark, setIsDark] = useState(
        () =>
            typeof document !== 'undefined' &&
            document.documentElement.classList.contains('dark'),
    )
    useEffect(() => {
        if (typeof document === 'undefined') return
        const sync = () =>
            setIsDark(document.documentElement.classList.contains('dark'))
        const observer = new MutationObserver(sync)
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class'],
        })
        return () => observer.disconnect()
    }, [])
    return isDark
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Per-lane client-side filter. Two AND-combined dimensions:
 *   - The funnel: a `field` plus EITHER `values` (chosen from a select/facet —
 *     matched by equality/IN against the card's field value) OR `text` (a
 *     free-text substring for text-only fields).
 *   - `query`: the lane search — a substring over the card title + field values.
 */
interface LaneFilterState {
    field?: string
    values?: string[]
    text?: string
    query?: string
}

/** Incremental pagination bookkeeping for one lane/stage. */
interface LanePageState {
    /** Next stage-scoped page to request. */
    nextPage: number
    /** Server total for the stage (from response meta), or null if unknown. */
    total: number | null
    /** A top-up request is in flight. */
    loading: boolean
    /** No more pages for this stage. */
    done: boolean
}

export interface DynamicKanbanProps {
    /** Model key as registered on the backend (e.g. "issue"). */
    model: string
    /**
     * Data endpoint base — the org-scoped LIST endpoint (e.g.
     * `/data/<model>/me`). The optimistic update PUTs to `<base>/<id>`.
     */
    endpoint?: string
    /** Bump to force a metadata + records refetch (same contract as DynamicTable). */
    refreshTrigger?: any
    /** Called when a card is clicked (outside its action menu). */
    onCardClick?: (row: any) => void
    /**
     * Host hook for `view`/`edit` card actions (STRING contract — same as
     * DynamicTable's `onAction`). When provided, `view`/`edit` route to the host
     * (e.g. its seeded record modal); when omitted they open the SDK's built-in
     * record dialog. `delete`/link/custom actions are always handled in-SDK.
     */
    onAction?: (action: string, row: any) => void
    /**
     * Size of the INITIAL board page (one request, grouped into lanes). Each
     * lane then tops up incrementally on scroll (see `lanePageSize`). Defaults
     * to 50 — enough to fill the visible lanes without loading the whole board.
     */
    pageSize?: number
    /**
     * Page size for a lane's incremental top-up fetch (scoped by
     * `f_<group_by>=<stage>`). Defaults to 25.
     */
    lanePageSize?: number
    /** IANA timezone for datetime card fields (org config). */
    timeZone?: string
    /** ISO 4217 currency for money card fields (org config). */
    currency?: string
    /**
     * Static equality filters always applied to the board (never shown as a
     * removable chip). Same contract as DynamicTable's `defaultFilters`.
     */
    defaultFilters?: Record<string, any>
}

export function DynamicKanban({
    model,
    endpoint,
    refreshTrigger,
    onCardClick,
    onAction,
    pageSize = 50,
    lanePageSize = 25,
    timeZone,
    currency,
    defaultFilters,
}: DynamicKanbanProps) {
    const { t, i18n } = useTranslation()
    const api = useApi()
    const isDark = useIsDarkTheme()

    const { getMetadata, setMetadata: cacheMetadata } = useMetadataCache()
    const cachedMeta = getMetadata(model)

    const [metadata, setMetadata] = useState<TableMetadata | null>(cachedMeta || null)
    const [records, setRecords] = useState<any[]>([])
    const [loading, setLoading] = useState(!cachedMeta)
    const [loadingData, setLoadingData] = useState(true)
    // Per-stage incremental pagination for infinite scroll. The initial board
    // page (grouped into lanes) is fetched once; each lane then tops up its OWN
    // stage via `f_<group_by>=<stage>&page=n`, appended (deduped by id) into the
    // shared `records`. `total` is the stage's server count when the response
    // meta carries it. Reset whenever the filters/search change.
    const [lanePagination, setLanePagination] = useState<
        Record<string, LanePageState>
    >({})

    // Active drag card id (for the DragOverlay + drop-zone highlighting).
    const [activeId, setActiveId] = useState<string | null>(null)

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    )

    // ---- metadata fetch (same path as DynamicTable) ----
    useEffect(() => {
        let cancelled = false
        const cached = getMetadata(model)
        if (cached) {
            setMetadata(cached)
            setLoading(false)
        } else {
            setLoading(true)
        }
        api
            .get(`/metadata/table/${model}`)
            .then((res) => {
                if (cancelled) return
                const body = res.data as ApiResponse<TableMetadata>
                if (body.success) {
                    setMetadata(body.data)
                    cacheMetadata(model, body.data)
                }
            })
            .catch((err) => {
                if (!cancelled && !cached)
                    console.error('Error al cargar la configuración del tablero', err)
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [model])

    // Shared metadata-driven filter engine — the SAME configs, option prefetch
    // and `f_<key>` serialization DynamicTable uses, so the board filters
    // identically to its table sibling.
    const {
        dynamicFilters,
        globalFilter,
        setGlobalFilter,
        columnFilterConfigs,
        filterParams,
        activeFilterCount,
        handleDynamicFilterChange,
        clearAll,
    } = useDynamicFilters(metadata, { defaultFilters, model, endpoint })

    // ---- initial board page (one request, grouped into lanes) ----
    // Resets the per-lane pagination so every lane restarts its incremental
    // top-up from scratch — called on mount, refresh, and any filter/search
    // change (fetchData's identity changes with filterParams).
    const fetchData = useCallback(async () => {
        if (!metadata) return
        setLoadingData(true)
        try {
            const res = (await api.get(endpoint || `/data/${model}`, {
                params: { page: 1, per_page: pageSize, ...filterParams },
            })) as { data: ApiResponse<any[]> }
            if (res.data.success) setRecords(res.data.data || [])
        } catch (err) {
            console.error('Error al cargar las tarjetas', err)
        } finally {
            setLoadingData(false)
        }
        setLanePagination({})
    }, [api, endpoint, model, metadata, pageSize, filterParams])

    // Load the next page for ONE lane/stage and append it (deduped by id) into
    // the shared records. Scoped by `f_<group_by>=<stage>` on top of the active
    // filterParams (the stage scope wins over any global group_by filter).
    const groupByKey = metadata?.group_by || ''
    const loadMoreLane = useCallback(
        async (stageKey: string) => {
            if (!metadata || !groupByKey) return
            const current = lanePagination[stageKey]
            if (current?.loading || current?.done) return
            const nextPage = current?.nextPage ?? 1
            setLanePagination((p) => ({
                ...p,
                [stageKey]: {
                    nextPage,
                    total: current?.total ?? null,
                    loading: true,
                    done: false,
                },
            }))
            try {
                const res = (await api.get(endpoint || `/data/${model}`, {
                    params: {
                        ...filterParams,
                        page: nextPage,
                        per_page: lanePageSize,
                        [`f_${groupByKey}`]: stageKey,
                    },
                })) as { data: ApiResponse<any[]> & { meta?: any } }
                const rows = res.data.success ? res.data.data || [] : []
                const total =
                    res.data.meta?.total ?? res.data.meta?.count ?? null
                setRecords((prev) => dedupeById(prev, rows))
                setLanePagination((p) => ({
                    ...p,
                    [stageKey]: {
                        nextPage: nextPage + 1,
                        total,
                        loading: false,
                        // Exhausted when the server returned a short page.
                        done: rows.length < lanePageSize,
                    },
                }))
            } catch (err) {
                console.error(`Error al cargar más tarjetas de ${stageKey}`, err)
                setLanePagination((p) => ({
                    ...p,
                    [stageKey]: {
                        nextPage,
                        total: current?.total ?? null,
                        loading: false,
                        done: false,
                    },
                }))
            }
        },
        [api, endpoint, model, metadata, groupByKey, filterParams, lanePageSize, lanePagination],
    )

    // Refetch when metadata resolves, on an explicit refresh, or when the
    // filters change. `fetchData` is stable while `filterParams` is unchanged
    // (both memoized), so this only re-runs on real input changes. Debounced so
    // typing in the search box doesn't fire a request per keystroke.
    useEffect(() => {
        if (!metadata) return
        const handle = setTimeout(() => {
            void fetchData()
        }, 200)
        return () => clearTimeout(handle)
    }, [fetchData, metadata, refreshTrigger])

    // Filterable fields for the toolbar, in metadata order (explicit filters
    // first, then filterable columns), each labeled from its metadata source.
    const filterFields = useMemo(() => {
        if (!metadata) return []
        const out: {
            key: string
            label: string
            config: NonNullable<ReturnType<typeof columnFilterConfigs.get>>
        }[] = []
        // Option labels come from the manifest as i18n keys (e.g.
        // "integration_github.stage.backlog"). ColumnFilterControl lives in the
        // ui package (no i18n), so translate labels HERE — on the static options
        // and on whatever the facet loader resolves — before they ever reach a
        // control, chip or value summary. A raw value (a repo name) has no key,
        // so t() returns it verbatim via defaultValue.
        const tr = (label: string) => t(label, { defaultValue: label })
        for (const [key, config] of columnFilterConfigs) {
            const f = metadata.filters?.find((x) => x.key === key)
            const c = metadata.columns.find((x) => x.key === key)
            const rawLabel = f?.label || c?.label || key
            const translatedConfig = {
                ...config,
                options: translateOptionLabels(config.options, tr),
                loadOptions: config.loadOptions
                    ? (q?: string) =>
                          config.loadOptions!(q).then((opts) =>
                              translateOptionLabels(opts, tr),
                          )
                    : undefined,
            }
            out.push({
                key,
                label: tr(rawLabel),
                config: translatedConfig,
            })
        }
        return out
    }, [metadata, columnFilterConfigs, t])

    // Split filters into active (with a selection) and the rest — the Sheet
    // groups the active ones on top, the rest alphabetically. Also drives the
    // removable chip row below the toolbar.
    const { activeFields, inactiveFields } = useMemo(() => {
        const active = filterFields.filter(
            (f) => (f.config.selectedValues?.length ?? 0) > 0,
        )
        const inactive = filterFields
            .filter((f) => (f.config.selectedValues?.length ?? 0) === 0)
            .sort((a, b) => a.label.localeCompare(b.label))
        return { activeFields: active, inactiveFields: inactive }
    }, [filterFields])

    // Sheet (grouped global filters) open state + per-lane client-side filters.
    // A lane filter narrows ONLY that stage's already-fetched cards by a field
    // value — instant, no refetch — so a user can drill into one column without
    // touching the rest of the board (the global filters, by contrast, refetch
    // the whole board server-side).
    const [filtersOpen, setFiltersOpen] = useState(false)
    // Per-lane client-side narrowing. Two independent, AND-combined dimensions:
    //   - `field`/`value`: the funnel — a field-scoped substring match.
    //   - `query`: the lane search — a substring over the card title + every
    //     visible field value.
    // A lane with neither is dropped from the map (so it reads as "unfiltered").
    const [laneFilters, setLaneFilters] = useState<
        Record<string, LaneFilterState>
    >({})
    const updateLaneFilter = useCallback(
        (stageKey: string, patch: Partial<LaneFilterState>) => {
            setLaneFilters((prev) => {
                const merged: LaneFilterState = { ...prev[stageKey], ...patch }
                const next = { ...prev }
                const hasFunnel = !!(
                    merged.field &&
                    ((merged.values && merged.values.length > 0) ||
                        merged.text?.trim())
                )
                const hasQuery = !!merged.query?.trim()
                if (hasFunnel || hasQuery) next[stageKey] = merged
                else delete next[stageKey]
                return next
            })
        },
        [],
    )

    const stages = useMemo(
        () => (metadata ? deriveStages(metadata) : []),
        [metadata],
    )
    const transitions = metadata?.transitions

    const grouped = useMemo(
        () => groupByStage(records, groupByKey, stages),
        [records, groupByKey, stages],
    )

    const { title: titleCol, fields: fieldCols } = useMemo(
        () => (metadata ? selectCardColumns(metadata) : { title: null, fields: [] }),
        [metadata],
    )

    // Columns the lane search scans: the card title + its visible field cells.
    const searchCols = useMemo(
        () => [titleCol, ...fieldCols].filter(Boolean) as ColumnDefinition[],
        [titleCol, fieldCols],
    )

    // Row-placement actions resolved EXACTLY like DynamicTable's action column:
    // capability-gated (when a <PermissionsProvider> is mounted) and with the
    // implicit View/Edit/Delete trio materialized for CRUD models. An action the
    // user lacks permission for never appears.
    const can = useCan()
    const permissionsActive = usePermissionsActive()
    const rowActions = useMemo(
        () =>
            metadata
                ? resolveRowActions(metadata, model, can, permissionsActive, (k, fb) =>
                      t(k, { defaultValue: fb }),
                  )
                : [],
        [metadata, model, can, permissionsActive, t],
    )

    // Shared row-action dispatch + dialogs — view/edit/delete/link/custom behave
    // identically to a table row (the card menu used to forward the raw action
    // object to the host and silently no-op).
    const { handleInternalAction, dialogs: rowActionDialogs } = useDynamicRowActions({
        model,
        endpoint,
        metadata,
        onAction,
        onRefresh: fetchData,
    })

    const cardById = useMemo(() => {
        const m = new Map<string, any>()
        for (const r of records) m.set(String(r.id), r)
        return m
    }, [records])

    const stageOfCard = useCallback(
        (id: string): string => {
            const card = cardById.get(id)
            const raw = card?.[groupByKey]
            return raw === null || raw === undefined ? '' : String(raw)
        },
        [cardById, groupByKey],
    )

    const onDragStart = useCallback((e: DragStartEvent) => {
        setActiveId(String(e.active.id))
    }, [])

    const onDragEnd = useCallback(
        async (e: DragEndEvent) => {
            setActiveId(null)
            const { active, over } = e
            if (!over) return
            const cardId = String(active.id)
            const destStage = String(over.id)
            const srcStage = stageOfCard(cardId)
            if (srcStage === destStage) return
            if (!isTransitionAllowed(transitions, srcStage, destStage)) {
                toast.error(
                    t('kanban.invalidTransition', {
                        defaultValue: 'Movimiento no permitido entre estas etapas',
                    }),
                )
                return
            }

            // OPTIMISTIC: move the card in local state immediately.
            const prevRecords = records
            const prevPagination = lanePagination
            setRecords((rs) =>
                rs.map((r) =>
                    String(r.id) === cardId ? { ...r, [groupByKey]: destStage } : r,
                ),
            )
            // Keep the server totals consistent with the moved card so a lane's
            // `count/total` header stays truthful with partial lanes: one leaves
            // the source stage, one joins the destination.
            setLanePagination((p) => applyLaneTotalsOnMove(p, srcStage, destStage))

            try {
                const base = endpoint || `/data/${model}`
                // `base` is the org-scoped list endpoint (e.g. `/data/<model>/me`),
                // so the per-record update is just `<base>/<id>` — same convention
                // as DynamicTable/DynamicRelation. Appending an extra `/me` here
                // produced `/data/<model>/me/me/<id>` → 404 on drag-to-move.
                const res = (await api.put(`${base}/${cardId}`, {
                    [groupByKey]: destStage,
                })) as { data?: ApiResponse<any> }
                if (res?.data && res.data.success === false) {
                    throw new Error(res.data.message || 'update_failed')
                }
            } catch (err: any) {
                // REVERT + toast on failure.
                setRecords(prevRecords)
                setLanePagination(prevPagination)
                toast.error(
                    t('kanban.moveFailed', {
                        defaultValue: 'No se pudo mover la tarjeta',
                    }) +
                        (err?.response?.data?.message
                            ? `: ${err.response.data.message}`
                            : ''),
                )
            }
        },
        [api, endpoint, groupByKey, lanePagination, model, records, stageOfCard, t, transitions],
    )

    if (loading) {
        return (
            <div className="flex gap-4 overflow-x-auto p-1">
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="w-[300px] shrink-0 space-y-3">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-24 w-full" />
                    </div>
                ))}
            </div>
        )
    }

    if (!metadata || !groupByKey || stages.length === 0) {
        return (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                {t('kanban.noStages', {
                    defaultValue:
                        'Este modelo no declara etapas para la vista de tablero.',
                })}
            </div>
        )
    }

    const activeCard = activeId ? cardById.get(activeId) : null
    const activeStage = activeId ? stageOfCard(activeId) : ''

    const lanes: StageMeta[] = [...stages]
    if (grouped.has(UNASSIGNED_LANE)) {
        lanes.push({
            key: UNASSIGNED_LANE,
            label: t('kanban.unassigned', { defaultValue: 'Sin etapa' }),
            color: 'slate',
            order: Number.MAX_SAFE_INTEGER,
        })
    }

    return (
        <div className="flex flex-col gap-3">
            {/* Filter bar — global search + one chip per filterable field, the
                SAME set the DynamicTable exposes in its column headers. Changing
                any control refetches the board server-side (debounced) via the
                shared useDynamicFilters engine. */}
            <div className="flex flex-wrap items-center gap-2" data-testid="kanban-filters">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={globalFilter}
                        onChange={(e) => setGlobalFilter(e.target.value)}
                        placeholder={t('kanban.searchPlaceholder', { defaultValue: 'Buscar...' })}
                        className="h-8 w-52 pl-8 text-sm"
                    />
                </div>
                {filterFields.length > 0 && (
                    <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                        <SheetTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 gap-1.5">
                                <ListFilter className="h-3.5 w-3.5" />
                                {t('kanban.filters', { defaultValue: 'Filtros' })}
                                {activeFilterCount > 0 && (
                                    <Badge
                                        variant="secondary"
                                        className="ml-0.5 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] tabular-nums"
                                    >
                                        {activeFilterCount}
                                    </Badge>
                                )}
                            </Button>
                        </SheetTrigger>
                        <SheetContent
                            side="right"
                            className="flex w-80 flex-col gap-0 p-0 sm:max-w-sm"
                        >
                            <SheetHeader className="space-y-0 border-b px-4 py-3">
                                <SheetTitle className="text-sm">
                                    {t('kanban.filters', { defaultValue: 'Filtros' })}
                                </SheetTitle>
                            </SheetHeader>
                            {/* Active filters grouped on top, the rest alphabetical
                                below a separator. Each row: label + its control; the
                                active field is highlighted by ColumnFilterControl's
                                own active styling. Same server-side engine as before. */}
                            <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-3">
                                {activeFields.length > 0 && (
                                    <>
                                        <p className="px-0.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                            {t('kanban.activeFilters', {
                                                defaultValue: 'Con filtros activos',
                                            })}
                                        </p>
                                        {activeFields.map((field) => (
                                            <SheetFilterRow
                                                key={field.key}
                                                field={field}
                                                isStage={field.key === groupByKey}
                                            />
                                        ))}
                                        {inactiveFields.length > 0 && (
                                            <div className="my-2 border-t" />
                                        )}
                                    </>
                                )}
                                {inactiveFields.map((field) => (
                                    <SheetFilterRow
                                        key={field.key}
                                        field={field}
                                        isStage={field.key === groupByKey}
                                    />
                                ))}
                            </div>
                            <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t bg-background px-4 py-3">
                                <span className="text-xs text-muted-foreground tabular-nums">
                                    {activeFilterCount > 0
                                        ? t('kanban.activeCount', {
                                              defaultValue: '{{count}} activos',
                                              count: activeFilterCount,
                                          })
                                        : t('kanban.noActiveFilters', {
                                              defaultValue: 'Sin filtros',
                                          })}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 gap-1 text-xs"
                                    onClick={clearAll}
                                    disabled={activeFilterCount === 0}
                                >
                                    <X className="h-3.5 w-3.5" />
                                    {t('kanban.clearAll', { defaultValue: 'Limpiar todo' })}
                                    {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                                </Button>
                            </div>
                        </SheetContent>
                    </Sheet>
                )}
            </div>

            {/* Removable chip row — shared with DynamicTable. Instant feedback
                without opening the Sheet; a chip's X clears that field. */}
            <FilterChipsRow
                fields={activeFields}
                onClearAll={clearAll}
                data-testid="kanban-filter-chips"
            />

            <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
                <div className="flex min-w-0 gap-4 overflow-x-auto p-1" data-testid="kanban-board">
                {lanes.map((stage) => {
                    const allCards = grouped.get(stage.key) ?? []
                    // Per-lane client-side narrowing (instant, scoped to this
                    // stage). The funnel (field/value) and the lane search
                    // (query) are AND-combined.
                    const laneFilter = laneFilters[stage.key]
                    let cards = allCards
                    if (laneFilter?.field) {
                        cards = cards.filter((c) =>
                            cardMatchesLaneFunnel(c, laneFilter),
                        )
                    }
                    if (laneFilter?.query?.trim()) {
                        cards = cards.filter((c) =>
                            cardMatchesLaneQuery(c, searchCols, laneFilter.query!),
                        )
                    }
                    const droppableAllowed =
                        !activeId ||
                        stage.key === activeStage ||
                        isTransitionAllowed(transitions, activeStage, stage.key)
                    // Infinite scroll is per declared stage; the synthetic
                    // "unassigned" lane can't be stage-scoped, so it never tops up.
                    const laneState = lanePagination[stage.key]
                    const isUnassigned = stage.key === UNASSIGNED_LANE
                    const laneHasMore = !isUnassigned && !laneState?.done
                    return (
                        <KanbanLane
                            key={stage.key}
                            stage={stage}
                            count={cards.length}
                            totalCount={allCards.length}
                            serverTotal={laneState?.total ?? null}
                            hasMore={laneHasMore}
                            loadingMore={!!laneState?.loading}
                            onLoadMore={() => loadMoreLane(stage.key)}
                            filterFields={filterFields}
                            laneFilter={laneFilter}
                            onFunnelChange={(f) =>
                                updateLaneFilter(stage.key, {
                                    field: f?.field,
                                    values: f?.values,
                                    text: f?.text,
                                })
                            }
                            onQueryChange={(q) =>
                                updateLaneFilter(stage.key, { query: q })
                            }
                            isDark={isDark}
                            dimmed={!!activeId && !droppableAllowed}
                            disabled={!!activeId && !droppableAllowed}
                        >
                            {loadingData && cards.length === 0 ? (
                                <>
                                    <Skeleton className="h-20 w-full" />
                                    <Skeleton className="h-20 w-full" />
                                </>
                            ) : cards.length === 0 ? (
                                <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                                    {t('kanban.emptyLane', { defaultValue: 'Sin tarjetas' })}
                                </p>
                            ) : (
                                cards.map((card) => (
                                    <KanbanCard
                                        key={String(card.id)}
                                        card={card}
                                        titleCol={titleCol}
                                        fieldCols={fieldCols}
                                        actions={rowActions}
                                        locale={i18n.language}
                                        timeZone={timeZone}
                                        currency={currency}
                                        onClick={onCardClick}
                                        onAction={handleInternalAction}
                                    />
                                ))
                            )}
                        </KanbanLane>
                    )
                })}
            </div>

            <DragOverlay>
                {activeCard ? (
                    <CardPreview
                        card={activeCard}
                        titleCol={titleCol}
                        fieldCols={fieldCols}
                        locale={i18n.language}
                        timeZone={timeZone}
                        currency={currency}
                    />
                ) : null}
            </DragOverlay>

            {rowActionDialogs}
            </DndContext>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Sheet filter row — a labeled ColumnFilterControl for the Filtros panel.
// ---------------------------------------------------------------------------

interface SheetFilterField {
    key: string
    label: string
    config: {
        filterType: string
        filterKey: string
        options: { label: string; value: string; icon?: string; color?: string }[]
        selectedValues: string[]
        onFilterChange: (filterKey: string, values: string[]) => void
        loading?: boolean
        searchEndpoint?: string
        loadOptions?: (q?: string) => Promise<any[]>
    }
}

/**
 * A per-data-type glyph for the Filtros panel rows (and their popover header):
 * Hash for numbers, Calendar for dates, CircleDot for the pipeline stage, Tag
 * for value pickers, ToggleLeft for booleans, Type for free text.
 */
function filterTypeIcon(filterType: string, isStage: boolean): React.ReactNode {
    if (isStage) return <CircleDot className="h-3.5 w-3.5" />
    switch (filterType) {
        case 'number_range':
            return <Hash className="h-3.5 w-3.5" />
        case 'date_range':
            return <Calendar className="h-3.5 w-3.5" />
        case 'boolean':
            return <ToggleLeft className="h-3.5 w-3.5" />
        case 'select':
        case 'dynamic_select':
        case 'facet':
            return <Tag className="h-3.5 w-3.5" />
        default:
            return <Type className="h-3.5 w-3.5" />
    }
}

function SheetFilterRow({
    field,
    isStage,
}: {
    field: SheetFilterField
    isStage: boolean
}) {
    const summary = summarizeFilterValues(
        field.config.selectedValues,
        field.config.options,
    )
    return (
        <ColumnFilterControl
            variant="row"
            align="end"
            icon={filterTypeIcon(field.config.filterType, isStage)}
            label={field.label}
            valueSummary={summary}
            filterKey={field.config.filterKey}
            filterType={field.config.filterType as ColumnFilterType}
            filterOptions={field.config.options}
            filterLoading={field.config.loading}
            filterSearchEndpoint={field.config.searchEndpoint}
            selectedValues={field.config.selectedValues}
            onFilterChange={field.config.onFilterChange}
            loadOptions={field.config.loadOptions}
        />
    )
}

// ---------------------------------------------------------------------------
// Lane (droppable column)
// ---------------------------------------------------------------------------

interface LaneFilterField {
    key: string
    label: string
    config?: ColumnFilterConfigLike
}

/** Minimal shape the lane funnel reads off a shared filter config. */
interface ColumnFilterConfigLike {
    filterType?: string
    filterKey?: string
    options?: { label: string; value: string; color?: string; count?: number }[]
    loadOptions?: (q?: string) => Promise<
        { label: string; value: string; color?: string; count?: number }[]
    >
}

/** The funnel's committed value: a field + either picked `values` or free `text`. */
interface LaneFunnelValue {
    field: string
    values?: string[]
    text?: string
}

interface KanbanLaneProps {
    stage: StageMeta
    count: number
    totalCount: number
    /** Server-reported total for the stage (from response meta), or null. */
    serverTotal: number | null
    /** More server pages available for this stage. */
    hasMore: boolean
    /** A top-up request for this stage is in flight. */
    loadingMore: boolean
    /** Request the next page for this stage. */
    onLoadMore: () => void
    filterFields: LaneFilterField[]
    laneFilter: LaneFilterState | undefined
    onFunnelChange: (filter: LaneFunnelValue | null) => void
    onQueryChange: (query: string) => void
    isDark: boolean
    dimmed: boolean
    disabled: boolean
    children: React.ReactNode
}

function KanbanLane({
    stage,
    count,
    totalCount,
    serverTotal,
    hasMore,
    loadingMore,
    onLoadMore,
    filterFields,
    laneFilter,
    onFunnelChange,
    onQueryChange,
    isDark,
    dimmed,
    disabled,
    children,
}: KanbanLaneProps) {
    const { t } = useTranslation()
    const { setNodeRef, isOver } = useDroppable({ id: stage.key, disabled })
    // Infinite scroll: the sentinel lives at the bottom of the lane's own scroll
    // container; a load in flight or an exhausted stage disables it.
    const { rootRef, sentinelRef } = useInfiniteScrollSentinel({
        onLoadMore,
        disabled: !hasMore || loadingMore,
    })
    const headerStyle = generateBadgeStyles(stage.color || optionColor(stage.key), {
        isDark,
    })
    const funnelField = filterFields.find((f) => f.key === laneFilter?.field)
    const funnelActive = !!(
        laneFilter?.field &&
        ((laneFilter.values && laneFilter.values.length > 0) ||
            laneFilter.text?.trim())
    )
    const queryActive = !!laneFilter?.query?.trim()
    const laneActive = funnelActive || queryActive
    const activeFieldLabel = funnelField?.label ?? laneFilter?.field
    // Human summary of the funnel value: resolved option labels for picked
    // values, or the raw free text.
    const funnelSummary =
        laneFilter?.values && laneFilter.values.length > 0
            ? summarizeFilterValues(laneFilter.values, funnelField?.config?.options)
            : laneFilter?.text ?? ''

    // Inline lane search: a Search icon expands an Input; Escape or blur-while-
    // empty collapses it. The query itself lives in the parent's laneFilters so
    // it survives collapse and combines with the funnel.
    const [searchOpen, setSearchOpen] = useState(queryActive)
    const searchRef = useRef<HTMLInputElement | null>(null)
    useEffect(() => {
        if (searchOpen) searchRef.current?.focus()
    }, [searchOpen])
    const funnelValue: LaneFunnelValue | undefined = laneFilter?.field
        ? {
              field: laneFilter.field,
              values: laneFilter.values,
              text: laneFilter.text,
          }
        : undefined

    return (
        <div
            ref={setNodeRef}
            className="group/lane flex w-[300px] shrink-0 flex-col rounded-xl border bg-muted/30 transition-opacity"
            style={{
                opacity: dimmed ? 0.45 : 1,
                outline: isOver && !disabled ? '2px solid var(--ring, #3b82f6)' : 'none',
                outlineOffset: 2,
            }}
            data-stage={stage.key}
            data-disabled={disabled || undefined}
        >
            <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                    <Badge
                        variant="outline"
                        className="border-0 text-xs font-semibold"
                        style={headerStyle}
                    >
                        {t(stage.label, { defaultValue: stage.label })}
                    </Badge>
                    <span className="text-xs font-medium tabular-nums text-muted-foreground">
                        {laneActive
                            ? `${count}/${totalCount}`
                            : serverTotal != null
                              ? `${count}/${serverTotal}`
                              : count}
                    </span>
                </div>
                {/* Lane actions — always visible in muted (a hidden hover-reveal
                    was undiscoverable); active state is a primary tint + a count
                    badge on the funnel. */}
                <div className="flex items-center gap-0.5">
                    <button
                        type="button"
                        onClick={() => setSearchOpen((o) => !o)}
                        className={`relative flex size-6 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-foreground ${
                            queryActive ? 'text-primary' : 'text-muted-foreground'
                        }`}
                        aria-label={t('kanban.searchLane', {
                            defaultValue: 'Buscar en la columna',
                        })}
                    >
                        <Search className="h-3.5 w-3.5" />
                        {queryActive && (
                            <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-primary" />
                        )}
                    </button>
                    <LaneFilterButton
                        fields={filterFields}
                        value={funnelValue}
                        onChange={onFunnelChange}
                    />
                </div>
            </div>
            {searchOpen && (
                <div className="px-3 pb-1.5">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            ref={searchRef}
                            value={laneFilter?.query ?? ''}
                            onChange={(e) => onQueryChange(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                    onQueryChange('')
                                    setSearchOpen(false)
                                }
                            }}
                            onBlur={() => {
                                if (!laneFilter?.query?.trim()) setSearchOpen(false)
                            }}
                            placeholder={t('kanban.searchLanePlaceholder', {
                                defaultValue: 'Buscar tarjetas...',
                            })}
                            className="h-7 pl-7 text-xs"
                        />
                    </div>
                </div>
            )}
            {funnelActive && (
                <div className="flex items-center gap-1 px-3 pb-1.5 text-[11px] text-muted-foreground">
                    <ListFilter className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                        {activeFieldLabel}: {funnelSummary}
                    </span>
                    <button
                        type="button"
                        onClick={() => onFunnelChange(null)}
                        className="ml-auto rounded p-0.5 hover:bg-muted"
                        aria-label={t('kanban.clearFilters', {
                            defaultValue: 'Limpiar',
                        })}
                    >
                        <X className="h-3 w-3" />
                    </button>
                </div>
            )}
            {/* Plain vertical-scroll column, NOT a Radix ScrollArea: the
                ScrollArea viewport wraps its content in a `display:table`
                element that shrink-to-fits the WIDEST card, so once the card
                text wraps freely (no line-clamp) the cards grew past the lane
                and spilled out of the stage. A normal `overflow-y-auto` block
                constrains every card to the lane width so text wraps inside it. */}
            <div
                ref={rootRef}
                className="flex min-h-[55vh] max-h-[70vh] min-w-0 flex-col gap-2 overflow-y-auto px-2 pb-3"
            >
                {children}
                {loadingMore && (
                    <Skeleton className="h-16 w-full shrink-0" data-testid="lane-loading-more" />
                )}
                {/* Sentinel: entering view triggers the next stage page. */}
                {hasMore && (
                    <div ref={sentinelRef} className="h-1 w-full shrink-0" aria-hidden />
                )}
            </div>
        </div>
    )
}

// LaneFilterButton — the per-column funnel. Picks a field + a value and narrows
// ONLY this lane's cards (client-side, in the parent). Draft state lives here so
// typing doesn't refilter mid-keystroke; Apply/Enter commits, Limpiar clears.
function LaneFilterButton({
    fields,
    value,
    onChange,
}: {
    fields: LaneFilterField[]
    value: LaneFunnelValue | undefined
    onChange: (filter: LaneFunnelValue | null) => void
}) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const [field, setField] = useState(value?.field ?? fields[0]?.key ?? '')
    const [values, setValues] = useState<string[]>(value?.values ?? [])
    const [text, setText] = useState(value?.text ?? '')
    // Re-seed the draft from the committed filter each time the popover opens.
    useEffect(() => {
        if (open) {
            setField(value?.field ?? fields[0]?.key ?? '')
            setValues(value?.values ?? [])
            setText(value?.text ?? '')
        }
    }, [open, value, fields])
    if (fields.length === 0) return null
    const active = !!(
        value &&
        ((value.values && value.values.length > 0) || value.text?.trim())
    )
    // Number of applied criteria on this lane's funnel (drives the count badge).
    const activeCount = laneFunnelCount(value)
    // The value step mirrors the sheet: when the chosen field is a select or a
    // facet (static options OR a lazy loader), render the SAME pro combobox —
    // multi-select, searchable, with counts. Only a genuinely free-text field
    // (no options, no loader) falls back to a raw "Contiene..." input.
    const cfg = fields.find((f) => f.key === field)?.config
    const hasValuePicker = (cfg?.options?.length ?? 0) > 0 || !!cfg?.loadOptions
    const toggle = (v: string) =>
        setValues((prev) =>
            prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
        )
    const apply = () => {
        if (field && values.length > 0) onChange({ field, values })
        else if (field && text.trim()) onChange({ field, text: text.trim() })
        else onChange(null)
        setOpen(false)
    }
    const clear = () => {
        onChange(null)
        setOpen(false)
    }
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={`relative flex size-6 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-foreground ${
                        active ? 'text-primary' : 'text-muted-foreground'
                    }`}
                    aria-label={t('kanban.filterLane', {
                        defaultValue: 'Filtrar columna',
                    })}
                >
                    <ListFilter className="h-3.5 w-3.5" />
                    {activeCount > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold leading-none text-primary-foreground tabular-nums">
                            {activeCount}
                        </span>
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                className="w-72 space-y-2.5 rounded-xl p-2.5 shadow-lg"
            >
                <Select
                    value={field}
                    onValueChange={(f) => {
                        setField(f)
                        // Reset the value when switching fields — a value picked
                        // for one field is meaningless for another.
                        setValues([])
                        setText('')
                    }}
                >
                    <SelectTrigger className="h-8 w-full text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {fields.map((f) => (
                            <SelectItem key={f.key} value={f.key} className="text-xs">
                                {f.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {hasValuePicker ? (
                    // `key={field}` remounts the combobox on field switch so it
                    // reloads that field's values from scratch (no stale list).
                    <div className="overflow-hidden rounded-lg border">
                        <FilterValueCombobox
                            key={field}
                            staticOptions={cfg?.options}
                            loadOptions={cfg?.loadOptions}
                            selected={values}
                            onToggle={toggle}
                        />
                    </div>
                ) : (
                    <Input
                        autoFocus
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') apply()
                        }}
                        placeholder={t('kanban.filterValue', {
                            defaultValue: 'Contiene...',
                        })}
                        className="h-8 w-full text-xs"
                    />
                )}
                <div className="flex gap-1.5">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 flex-1 text-xs"
                        onClick={clear}
                        disabled={!active && values.length === 0 && !text.trim()}
                    >
                        {t('kanban.clearFilters', { defaultValue: 'Limpiar' })}
                    </Button>
                    <Button
                        size="sm"
                        className="h-7 flex-1 text-xs"
                        onClick={apply}
                        disabled={values.length === 0 && !text.trim()}
                    >
                        {t('kanban.apply', { defaultValue: 'Aplicar' })}
                        {values.length > 0 ? ` (${values.length})` : ''}
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    )
}

// ---------------------------------------------------------------------------
// Card (draggable)
// ---------------------------------------------------------------------------

interface KanbanCardProps {
    card: any
    titleCol: ColumnDefinition | null
    fieldCols: ColumnDefinition[]
    actions: ActionDefinition[]
    locale: string
    timeZone?: string
    currency?: string
    onClick?: (row: any) => void
    /** STRING contract — dispatch the action by its key (see useDynamicRowActions). */
    onAction: (actionKey: string, record: any) => void
}

function KanbanCard({
    card,
    titleCol,
    fieldCols,
    actions,
    locale,
    timeZone,
    currency,
    onClick,
    onAction,
}: KanbanCardProps) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: String(card.id),
    })

    const visibleActions = actions.filter((a) => isRowActionVisible(a, card))

    return (
        <Card
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            className="w-full min-w-0 cursor-grab active:cursor-grabbing border-border/70 shadow-sm"
            style={{ opacity: isDragging ? 0.4 : 1 }}
            onClick={() => onClick?.(card)}
            data-card-id={String(card.id)}
        >
            <CardContent className="space-y-1.5 p-3">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 break-words text-sm font-medium leading-snug">
                        {titleCol ? (
                            <ActivityValueRenderer
                                value={card[titleCol.key]}
                                col={titleCol}
                                locale={locale}
                                timeZone={timeZone}
                                currency={currency}
                            />
                        ) : (
                            <span className="truncate">{String(card.id)}</span>
                        )}
                    </div>
                    {visibleActions.length > 0 && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 shrink-0 -mr-1 -mt-1"
                                    // Don't start a drag / card click from the menu button.
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                {visibleActions.map((a) => (
                                    <DropdownMenuItem
                                        key={a.key}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            onAction(a.key, card)
                                        }}
                                    >
                                        <DynamicIcon
                                            name={a.icon || 'Zap'}
                                            className="mr-2 h-4 w-4"
                                        />
                                        {a.label}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
                {fieldCols.map((col) => (
                    <div
                        key={col.key}
                        className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground"
                    >
                        <span className="shrink-0 opacity-70">{col.label}:</span>
                        <span className="min-w-0 break-words">
                            <ActivityValueRenderer
                                value={card[col.key]}
                                col={col}
                                locale={locale}
                                timeZone={timeZone}
                                currency={currency}
                            />
                        </span>
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}

// Static preview rendered inside the DragOverlay (no dnd hooks, no menu).
function CardPreview({
    card,
    titleCol,
    fieldCols,
    locale,
    timeZone,
    currency,
}: Omit<KanbanCardProps, 'actions' | 'onClick' | 'onAction'>) {
    return (
        <Card className="w-[284px] cursor-grabbing border-primary/40 shadow-lg">
            <CardContent className="space-y-1.5 p-3">
                <div className="break-words text-sm font-medium leading-snug">
                    {titleCol ? (
                        <ActivityValueRenderer
                            value={card[titleCol.key]}
                            col={titleCol}
                            locale={locale}
                            timeZone={timeZone}
                            currency={currency}
                        />
                    ) : (
                        String(card.id)
                    )}
                </div>
                {fieldCols.map((col) => (
                    <div
                        key={col.key}
                        className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground"
                    >
                        <span className="shrink-0 opacity-70">{col.label}:</span>
                        <span className="min-w-0 break-words">
                            <ActivityValueRenderer
                                value={card[col.key]}
                                col={col}
                                locale={locale}
                                timeZone={timeZone}
                                currency={currency}
                            />
                        </span>
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}
