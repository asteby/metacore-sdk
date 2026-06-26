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
import { useEffect, useState } from 'react'
import { useApi } from './api-context'
import { useMetadataCache } from './metadata-cache'
import { DynamicTable, type DynamicTableProps } from './dynamic-table'
import { DynamicKanban, type DynamicKanbanProps } from './dynamic-kanban'
import type { TableMetadata, ApiResponse } from './types'

/**
 * Pure routing decision: which renderer a `view_type` maps onto. Exported so a
 * host that resolves metadata itself can branch without mounting this wrapper.
 */
export function resolveViewRenderer(
    viewType: string | undefined,
): 'kanban' | 'table' {
    return viewType === 'kanban' ? 'kanban' : 'table'
}

export interface DynamicViewProps extends DynamicTableProps {
    /**
     * Props forwarded to <DynamicKanban> when the model resolves to a kanban
     * view. `model`/`endpoint`/`refreshTrigger`/`timeZone`/`currency` are shared
     * with the table props and forwarded automatically; this is for the
     * kanban-only extras (e.g. `onCardClick`, `pageSize`).
     */
    kanbanProps?: Partial<Omit<DynamicKanbanProps, 'model' | 'endpoint'>>
}

export function DynamicView({ kanbanProps, ...tableProps }: DynamicViewProps) {
    const { model, endpoint, refreshTrigger, timeZone, currency } = tableProps
    const api = useApi()
    const cached = useMetadataCache((s) => s.getMetadata(model))
    const setMeta = useMetadataCache((s) => s.setMetadata)
    const [viewType, setViewType] = useState<string | undefined>(cached?.view_type)
    const [resolved, setResolved] = useState<boolean>(!!cached)

    useEffect(() => {
        let cancelled = false
        const c = useMetadataCache.getState().getMetadata(model)
        if (c) {
            setViewType(c.view_type)
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

    // Until we know the view type, render nothing transient-heavy: default to the
    // table renderer only once resolved to avoid a table→kanban flash.
    if (!resolved && !cached) return null

    if (resolveViewRenderer(viewType) === 'kanban') {
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
