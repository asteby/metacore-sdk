// Pure helpers that map kernel `manifest.ColumnDef` metadata flags
// (Visibility, Searchable) into client-side decisions:
//   - which columns the dynamic table should render
//   - which column keys are in scope for the global search
//
// Kept side-effect free and free of React/UI imports so the same logic can
// be tested with plain unit tests against mock metadata.

import type { ColumnDefinition, TableMetadata } from './types'

/**
 * Whether a column should render in a list/index table view.
 *
 * A column is hidden when its `visibility` is scoped away from the table
 * (`'modal'`: only the create/edit dialog; `'list'`: only API payloads) or
 * when the legacy `hidden` boolean is set. Empty / `'all'` / `'table'` keep
 * the column visible — preserving zero-value behaviour for metadata emitted
 * by older kernels that don't set `visibility` at all.
 */
export function isColumnVisibleInTable(col: ColumnDefinition): boolean {
    if (col.hidden) return false
    const v = col.visibility
    if (!v) return true
    return v === 'all' || v === 'table'
}

/**
 * Returns the keys of columns that opt into the model's full-text search,
 * or `null` when no column declares `searchable` at all.
 *
 * `null` is the legacy signal: the host should NOT narrow the search request
 * (every column participates, matching pre-Searchable kernels). An empty
 * array is meaningful — it means every column has been explicitly opted out
 * and the host should disable the global search input.
 */
export function getSearchableColumnKeys(
    metadata: Pick<TableMetadata, 'columns'>,
): string[] | null {
    const cols = metadata.columns ?? []
    const declared = cols.some(c => typeof c.searchable === 'boolean')
    if (!declared) return null
    return cols.filter(c => c.searchable === true).map(c => c.key)
}
