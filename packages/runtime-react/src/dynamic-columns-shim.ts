// Type-only definitions for dynamic column builders. The actual
// `getDynamicColumns` implementation is host-owned (it renders design-system
// specific primitives like Badge/Avatar/MediaGallery tied to the host's
// shadcn theme). Hosts pass their implementation into <DynamicTable> via the
// `getDynamicColumns` prop.
import type { ColumnDef } from '@tanstack/react-table'
import type { ActionDefinition, TableMetadata } from './types'

export interface FilterOption {
    label: string
    value: string
    icon?: string
    color?: string
    /** Occurrence count for `facet` options (rendered muted, right-aligned). */
    count?: number
}

export interface ColumnFilterConfig {
    filterType: 'select' | 'boolean' | 'date_range' | 'number_range' | 'text' | 'facet' | string
    filterKey: string
    options: FilterOption[]
    selectedValues: string[]
    onFilterChange: (filterKey: string, values: string[]) => void
    loading?: boolean
    searchEndpoint?: string
    /**
     * Lazy option loader for `facet` filters — resolves the column's distinct
     * values + counts from the `/facets` endpoint. Passed straight through to
     * `ColumnFilterControl.loadOptions`.
     */
    loadOptions?: (q?: string) => Promise<FilterOption[]>
}

/**
 * Consumer-side, per-row gate for row actions. Receives the full action
 * definition and the row; return `false` to hide the action for that row. It
 * is AND-ed with the metadata gates (`requiresState` + `condition`), so it can
 * only hide more, never reveal an action the metadata already hides. A throwing
 * predicate hides the action (fail-closed) and logs via `console.error`.
 *
 * Pass a stable reference (module-level function or `useCallback`): a new
 * identity on every render rebuilds the table columns.
 *
 * Adapting a `(actionKey, row)` predicate: `(a, row) => legacy(a.key, row)`.
 */
export type RowActionPredicate = (action: ActionDefinition, row: Record<string, unknown>) => boolean

/** Signature for the host-provided `getDynamicColumns` factory. */
export type GetDynamicColumns = (
    metadata: TableMetadata,
    handleAction: (action: string, row: any) => void,
    t: (key: string, options?: any) => string,
    language: string,
    columnFilterConfigs: Map<string, ColumnFilterConfig>,
    timeZone?: string,
    currency?: string,
    /** Consumer row-action predicate (`DynamicTable.isRowActionVisible`). Custom factories may ignore it. */
    rowActionPredicate?: RowActionPredicate,
) => ColumnDef<any>[]

/** Signature for the host-provided `DynamicIcon` renderer. */
export type DynamicIconComponent = React.ComponentType<{ name: string; className?: string }>
