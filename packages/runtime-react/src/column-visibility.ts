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
 * Whether a column should render in a MODAL context — the create/edit/view
 * dialog. Mirror image of {@link isColumnVisibleInTable}: a column scoped to
 * `'table'` (list-only) or `'list'` (API-only) is hidden here, while empty /
 * `'all'` / `'modal'` keep it visible. Preserves zero-value behaviour for
 * metadata emitted by older kernels that never set `visibility`.
 */
export function isColumnVisibleInModal(col: ColumnDefinition): boolean {
    if (col.hidden) return false
    const v = col.visibility
    if (!v) return true
    return v === 'all' || v === 'modal'
}

/**
 * Audit / system columns that are pure noise inside a child line list rendered
 * under a parent record (line items, one_to_many panels in the view modal):
 * they are either constant for the parent (`organization_id`) or already
 * obvious from the parent record (`created_by`, timestamps). Hidden by default
 * in that context — see {@link isColumnVisibleInLineSubtable}.
 */
export const AUDIT_SUBTABLE_COLUMN_KEYS: readonly string[] = [
    'created_by',
    'updated_by',
    'created_at',
    'updated_at',
    'deleted_at',
    'organization_id',
]

/**
 * Column visibility decision for a sub-table of lines/relations rendered inside
 * the view modal of a parent record. Two rules on top of the modal criterion:
 *
 *   1. Respect `visibility`: a column scoped to `'table'`/`'list'` never shows
 *      here (reuses {@link isColumnVisibleInModal}), so a manifest hides a
 *      redundant column from the sub-table with `visibility: "table"`.
 *   2. Audit columns ({@link AUDIT_SUBTABLE_COLUMN_KEYS}) are hidden BY DEFAULT
 *      — unless the manifest explicitly opts them back in by declaring a
 *      `visibility` (`'all'`/`'modal'`) on that column.
 *
 * Only applies to the embedded child-list context; the main `/m/<model>` table
 * uses {@link isColumnVisibleInTable} and is unaffected.
 */
/**
 * True when a column key is (or belongs to) an audit column. Matches the plain
 * key AND its resolved-relation projections: a `created_by` user relation is
 * served as `created_by.avatar` / `created_by.name` (avatar+name+email cell),
 * so an exact-match check missed it and the column still showed. We match the
 * base key or any `<key>.<subfield>` projection.
 */
function isAuditColumnKey(key: string): boolean {
    return AUDIT_SUBTABLE_COLUMN_KEYS.some(
        (k) => key === k || key.startsWith(k + '.'),
    )
}

export function isColumnVisibleInLineSubtable(col: ColumnDefinition): boolean {
    if (!isColumnVisibleInModal(col)) return false
    if (!col.visibility && isAuditColumnKey(col.key)) return false
    return true
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
