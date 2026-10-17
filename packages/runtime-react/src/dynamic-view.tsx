// DynamicView — the single entry point a host renders for a model's "list"
// surface. It picks the renderer from the model's `view_type`:
//   - `'kanban'` → <DynamicKanban>
//   - anything else / absent → <DynamicTable> (the default)
//
// The decision is metadata-driven (RFC §1.2): the kernel serves `view_type` +
// `group_by` on the table metadata, derived from the nav item. A host that
// already knows the view type can skip this and render the concrete component
// directly; a generic host route (e.g. ops `/m/$model`) mounts <DynamicView>
// and lets the metadata decide, so the same model can expose a `table` nav and
// a `kanban` nav with no host code change.
//
// Both child components fetch their own metadata (cache-backed), so the extra
// read this wrapper does to learn `view_type` is served from the same cache —
// no duplicate network round-trip in practice.
import { useEffect, useMemo, useState } from 'react'
import { useApi } from './api-context'
import { useMetadataCache } from './metadata-cache'
import { DynamicTable, type DynamicTableProps } from './dynamic-table'
import { DynamicKanban, type DynamicKanbanProps } from './dynamic-kanban'
import type { TableMetadata, ApiResponse } from './types'
import { DeclarativeView, isDeclarativeViewType } from './views/registry'
import { createApiViewDataSource } from './views/data-source'
import type { ViewDataSource } from './views/types'

/**
 * Pure routing decision: which renderer a `view_type` maps onto. Exported so a
 * host that resolves metadata itself can branch without mounting this wrapper.
 */
export function resolveViewRenderer(
    viewType: string | undefined,
): 'kanban' | 'table' {
    return viewType === 'kanban' ? 'kanban' : 'table'
}

/**
 * Full routing decision including the declarative views: `'declarative'`
 * when the type is map/timeline/calendar/chart/split AND the metadata carries
 * its `view` block; otherwise the same table/kanban rule as
 * {@link resolveViewRenderer} (a host that does not serve `view` keeps the
 * table, exactly like before).
 */
export function resolveViewKind(
    viewType: string | undefined,
    meta: Pick<TableMetadata, 'view'> | null | undefined,
): 'declarative' | 'kanban' | 'table' {
    if (isDeclarativeViewType(viewType) && meta?.view && (meta.view as Record<string, unknown>)[viewType]) {
        return 'declarative'
    }
    return resolveViewRenderer(viewType)
}

/**
 * Reads the `view` selector out of a URL search string (`?view=kanban`, a bare
 * `view=kanban`, or a full href). Returns `undefined` when absent. The query is
 * the per-NAV signal: the same model exposes a "Board" nav (`?view=kanban`) and
 * an "Issues" nav (`?view=list`), so the query — not the model-level
 * `metadata.view_type` — decides which surface to paint. SSR-safe.
 */
export function readViewFromSearch(search?: string): string | undefined {
    if (!search) return undefined
    const qIndex = search.indexOf('?')
    const qs = qIndex === -1 ? search : search.slice(qIndex + 1)
    const v = new URLSearchParams(qs).get('view')
    return v ?? undefined
}

/**
 * Resolves the effective view selector with the right precedence:
 *   1. an explicit `view` prop the host passes (it owns the router), then
 *   2. the `view` query param, then
 *   3. the model-level `metadata.view_type` default.
 * Exported pure for unit tests and host reuse.
 */
export function resolveActiveView(
    explicit: string | undefined,
    search: string | undefined,
    metadataViewType: string | undefined,
): string | undefined {
    return explicit ?? readViewFromSearch(search) ?? metadataViewType
}

export interface DynamicViewProps extends DynamicTableProps {
    /**
     * Explicit view selector from the host's router (e.g. the `view` search
     * param resolved by tanstack-router). Takes precedence over the query string
     * and the model's `metadata.view_type`. Pass this when the host owns routing
     * so the same model can show `?view=kanban` (board) or `?view=list` (table)
     * with no per-model metadata change.
     */
    view?: string
    /**
     * Props forwarded to <DynamicKanban> when the model resolves to a kanban
     * view. `model`/`endpoint`/`refreshTrigger`/`timeZone`/`currency` are shared
     * with the table props and forwarded automatically; this is for the
     * kanban-only extras (e.g. `onCardClick`, `pageSize`).
     */
    kanbanProps?: Partial<Omit<DynamicKanbanProps, 'model' | 'endpoint'>>
    /**
     * Data source for declarative views (map/timeline/calendar/chart/split).
     * Default: {@link createApiViewDataSource} over the injected ApiClient.
     */
    viewDataSource?: ViewDataSource
    /** Open a record from a declarative view (host detail route or drawer). */
    onOpenRecord?: (row: Record<string, unknown>) => void
    /** BCP-47 locale for declarative views. */
    locale?: string
}

export function DynamicView({
    view,
    kanbanProps,
    viewDataSource,
    onOpenRecord,
    locale,
    ...tableProps
}: DynamicViewProps) {
    const { model, endpoint, refreshTrigger, timeZone, currency } = tableProps
    const api = useApi()
    const cached = useMetadataCache((s) => s.getMetadata(model))
    const setMeta = useMetadataCache((s) => s.setMetadata)
    const [viewType, setViewType] = useState<string | undefined>(cached?.view_type)
    const [meta, setMetaState] = useState<TableMetadata | null>(cached ?? null)
    const dataSource = useMemo(() => viewDataSource ?? createApiViewDataSource(api), [viewDataSource, api])
    const [resolved, setResolved] = useState<boolean>(!!cached)

    useEffect(() => {
        let cancelled = false
        const c = useMetadataCache.getState().getMetadata(model)
        if (c) {
            setViewType(c.view_type)
            setMetaState(c)
            setResolved(true)
        }
        api
            .get(`/metadata/table/${model}`)
            .then((res) => {
                if (cancelled) return
                const body = res.data as ApiResponse<TableMetadata>
                const meta = body?.success ? body.data : (res.data as TableMetadata)
                if (meta) {
                    setViewType(meta.view_type)
                    setMetaState(meta)
                    setMeta(model, meta)
                }
            })
            .catch(() => {
                /* fall back to the table renderer */
            })
            .finally(() => {
                if (!cancelled) setResolved(true)
            })
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [model])

    // The per-nav `view` (explicit prop or `?view=` query) wins over the
    // model-level metadata default so two navs on the same model route to
    // different surfaces.
    const search =
        typeof window !== 'undefined' ? window.location.search : undefined
    const effectiveView = resolveActiveView(view, search, viewType)

    // Until we know the view type, render nothing transient-heavy: default to the
    // table renderer only once resolved to avoid a table→kanban flash. An
    // explicit/query view short-circuits the wait (we already know the surface).
    if (!resolved && !cached && view === undefined && !readViewFromSearch(search))
        return null

    const kind = resolveViewKind(effectiveView, meta)
    if (kind === 'declarative' && effectiveView) {
        return (
            <DeclarativeView
                viewType={effectiveView}
                view={meta?.view}
                model={model}
                metadata={meta}
                data={dataSource}
                onOpenRecord={onOpenRecord}
                locale={locale}
                currency={currency}
                timeZone={timeZone}
                fallback={<DynamicTable {...tableProps} />}
            />
        )
    }

    if (kind === 'kanban') {
        return (
            <DynamicKanban
                model={model}
                endpoint={endpoint}
                refreshTrigger={refreshTrigger}
                timeZone={timeZone}
                currency={currency}
                {...kanbanProps}
            />
        )
    }

    return <DynamicTable {...tableProps} />
}
