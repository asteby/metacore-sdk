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
import { MoreHorizontal, Search, X } from 'lucide-react'
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
    Skeleton,
} from '@asteby/metacore-ui/primitives'
import { ColumnFilterControl, type ColumnFilterType } from '@asteby/metacore-ui/data-table'
import { generateBadgeStyles, optionColor } from '@asteby/metacore-ui/lib'
import { useApi } from './api-context'
import { useDynamicFilters } from './use-dynamic-filters'
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
     * Max cards fetched per lane render. Kanban shows all cards at once (no
     * pagination UI), so it requests a single large page. Defaults to 200.
     */
    pageSize?: number
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
    pageSize = 200,
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
        globalFilter,
        setGlobalFilter,
        columnFilterConfigs,
        filterParams,
        activeFilterCount,
        clearAll,
    } = useDynamicFilters(metadata, { defaultFilters })

    // ---- records fetch (same path as DynamicTable, single large page) ----
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
    }, [api, endpoint, model, metadata, pageSize, filterParams])

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
        for (const [key, config] of columnFilterConfigs) {
            const f = metadata.filters?.find((x) => x.key === key)
            const c = metadata.columns.find((x) => x.key === key)
            const rawLabel = f?.label || c?.label || key
            out.push({ key, label: t(rawLabel, { defaultValue: rawLabel }), config })
        }
        return out
    }, [metadata, columnFilterConfigs, t])

    const stages = useMemo(
        () => (metadata ? deriveStages(metadata) : []),
        [metadata],
    )
    const groupByKey = metadata?.group_by || ''
    const transitions = metadata?.transitions

    const grouped = useMemo(
        () => groupByStage(records, groupByKey, stages),
        [records, groupByKey, stages],
    )

    const { title: titleCol, fields: fieldCols } = useMemo(
        () => (metadata ? selectCardColumns(metadata) : { title: null, fields: [] }),
        [metadata],
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
            setRecords((rs) =>
                rs.map((r) =>
                    String(r.id) === cardId ? { ...r, [groupByKey]: destStage } : r,
                ),
            )

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
        [api, endpoint, groupByKey, model, records, stageOfCard, t, transitions],
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
                {filterFields.map((field) => (
                    <ColumnFilterControl
                        key={field.key}
                        showLabel
                        label={field.label}
                        filterKey={field.config.filterKey}
                        filterType={field.config.filterType as ColumnFilterType}
                        filterOptions={field.config.options}
                        filterLoading={field.config.loading}
                        filterSearchEndpoint={field.config.searchEndpoint}
                        selectedValues={field.config.selectedValues}
                        onFilterChange={field.config.onFilterChange}
                    />
                ))}
                {activeFilterCount > 0 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-xs text-muted-foreground"
                        onClick={clearAll}
                    >
                        <X className="h-3.5 w-3.5" />
                        {t('kanban.clearFilters', { defaultValue: 'Limpiar' })}
                        {` (${activeFilterCount})`}
                    </Button>
                )}
            </div>

            <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
                <div className="flex min-w-0 gap-4 overflow-x-auto p-1" data-testid="kanban-board">
                {lanes.map((stage) => {
                    const cards = grouped.get(stage.key) ?? []
                    const droppableAllowed =
                        !activeId ||
                        stage.key === activeStage ||
                        isTransitionAllowed(transitions, activeStage, stage.key)
                    return (
                        <KanbanLane
                            key={stage.key}
                            stage={stage}
                            count={cards.length}
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
// Lane (droppable column)
// ---------------------------------------------------------------------------

interface KanbanLaneProps {
    stage: StageMeta
    count: number
    isDark: boolean
    dimmed: boolean
    disabled: boolean
    children: React.ReactNode
}

function KanbanLane({ stage, count, isDark, dimmed, disabled, children }: KanbanLaneProps) {
    const { t } = useTranslation()
    const { setNodeRef, isOver } = useDroppable({ id: stage.key, disabled })
    const headerStyle = generateBadgeStyles(stage.color || optionColor(stage.key), {
        isDark,
    })
    return (
        <div
            ref={setNodeRef}
            className="flex w-[300px] shrink-0 flex-col rounded-lg border bg-muted/30 transition-opacity"
            style={{
                opacity: dimmed ? 0.45 : 1,
                outline: isOver && !disabled ? '2px solid var(--ring, #3b82f6)' : 'none',
                outlineOffset: 2,
            }}
            data-stage={stage.key}
            data-disabled={disabled || undefined}
        >
            <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                <Badge
                    variant="outline"
                    className="border-0 text-xs font-semibold"
                    style={headerStyle}
                >
                    {t(stage.label, { defaultValue: stage.label })}
                </Badge>
                <span className="text-xs font-medium tabular-nums text-muted-foreground">
                    {count}
                </span>
            </div>
            {/* Plain vertical-scroll column, NOT a Radix ScrollArea: the
                ScrollArea viewport wraps its content in a `display:table`
                element that shrink-to-fits the WIDEST card, so once the card
                text wraps freely (no line-clamp) the cards grew past the lane
                and spilled out of the stage. A normal `overflow-y-auto` block
                constrains every card to the lane width so text wraps inside it. */}
            <div className="flex min-h-[55vh] max-h-[70vh] min-w-0 flex-col gap-2 overflow-y-auto px-2 pb-3">
                {children}
            </div>
        </div>
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
