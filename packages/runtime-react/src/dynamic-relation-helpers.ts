// Pure helpers for DynamicRelation. Live in their own module so unit tests
// run in node (no DOM, no metacore-ui primitives) and consumers can reuse the
// URL/payload conventions outside the component.
import type { ActionFieldDef, ColumnDefinition, TableMetadata } from './types'

export type DynamicRelationKind = 'one_to_many' | 'many_to_many'

export interface PivotRowLike {
    id?: string | number | null
    [k: string]: unknown
}

export interface TargetRowLike {
    id?: string | number | null
    [k: string]: unknown
}

/**
 * Builds the query params used by `<DynamicRelation kind="one_to_many">` to
 * scope a child list to a single parent record. Mirrors the
 * `f_<column>=eq:<value>` convention enforced by `query/params.go` in the
 * kernel.
 */
export function buildRelationFilterParams(
    foreignKey: string,
    parentId: string | number,
): Record<string, string> {
    if (!foreignKey) throw new Error('foreignKey requerido')
    if (parentId === undefined || parentId === null || parentId === '') {
        throw new Error('parentId requerido')
    }
    return { [`f_${foreignKey}`]: `eq:${String(parentId)}` }
}

/**
 * Builds the POST body for creating a child row. The foreign key is forced to
 * `parentId` regardless of what the form returned — the inline form hides the
 * FK input but a misbehaving caller (or a manual override) should not be able
 * to redirect the row to a different parent.
 */
export function buildCreatePayload(
    foreignKey: string,
    parentId: string | number,
    formValues: Record<string, any>,
): Record<string, any> {
    if (!foreignKey) throw new Error('foreignKey requerido')
    return { ...formValues, [foreignKey]: parentId }
}

/**
 * Maps a `TableMetadata.columns` shape into `ActionFieldDef[]` so the inline
 * form can be rendered with `<DynamicForm>`. Excludes the foreign-key column
 * (already fixed to parentId) and any column flagged `hidden`. Falls back to
 * sensible widget hints derived from `ColumnDefinition.type`.
 */
export function deriveRelationFormFields(
    metadata: Pick<TableMetadata, 'columns'> | null | undefined,
    foreignKey: string,
): ActionFieldDef[] {
    if (!metadata?.columns) return []
    const out: ActionFieldDef[] = []
    for (const col of metadata.columns) {
        if (col.key === foreignKey) continue
        if (col.hidden) continue
        out.push({
            key: col.key,
            label: col.label,
            type: columnTypeToFieldType(col),
            required: false,
            options: col.options?.map(o => ({ value: String(o.value), label: o.label })),
        })
    }
    return out
}

function columnTypeToFieldType(col: ColumnDefinition): string {
    switch (col.type) {
        case 'number': return 'number'
        case 'boolean': return 'boolean'
        case 'date': return 'date'
        case 'select': return 'select'
        case 'text':
        default:
            return 'string'
    }
}

/**
 * Stable id for relation rows. Falls back to a synthetic
 * `__rel-<foreignKey>-<index>` when the row has no id — keeps React keys
 * stable and lets optimistic creates render before the backend assigns an id.
 */
export function relationRowKey(
    row: { id?: string | number | null } | undefined,
    index: number,
    foreignKey: string,
): string {
    if (row && row.id !== undefined && row.id !== null && row.id !== '') {
        return String(row.id)
    }
    return `__rel-${foreignKey}-${index}`
}

// ---------------------------------------------------------------------------
// many_to_many helpers
// ---------------------------------------------------------------------------

/**
 * Builds the POST body for attaching a target row to the parent through the
 * pivot table. Both FKs are required: `foreignKey -> parentId` (pivot side)
 * and `referencesKey -> targetId` (target side). Extra pivot fields can be
 * passed via `extra` (e.g. `role`, `position`); never override the two FKs.
 */
export function buildPivotAttachPayload(
    foreignKey: string,
    parentId: string | number,
    referencesKey: string,
    targetId: string | number,
    extra?: Record<string, any>,
): Record<string, any> {
    if (!foreignKey) throw new Error('foreignKey requerido')
    if (!referencesKey) throw new Error('referencesKey requerido')
    if (parentId === undefined || parentId === null || parentId === '') {
        throw new Error('parentId requerido')
    }
    if (targetId === undefined || targetId === null || targetId === '') {
        throw new Error('targetId requerido')
    }
    return {
        ...(extra || {}),
        [foreignKey]: parentId,
        [referencesKey]: targetId,
    }
}

/**
 * From a list of pivot rows, returns the set of currently-attached target ids
 * coerced to string (the form expected by `<MultiSelect>` `selected`).
 * Skips rows missing the FK (defensive — the kernel should never return them).
 */
export function extractSelectedTargetIds(
    pivotRows: ReadonlyArray<PivotRowLike> | null | undefined,
    referencesKey: string,
): string[] {
    if (!pivotRows || !referencesKey) return []
    const out: string[] = []
    for (const row of pivotRows) {
        const v = row[referencesKey]
        if (v === undefined || v === null || v === '') continue
        out.push(String(v))
    }
    return out
}

/**
 * Builds a `targetId -> pivotRowId` lookup so detach can DELETE the pivot row
 * by its own id without re-fetching. When several pivot rows point at the
 * same target (shouldn't happen with a unique constraint but the kernel does
 * not guarantee it), the *last* one wins — detach will only drop one at a
 * time, the next render will surface the leftover.
 */
export function buildPivotRowIndex(
    pivotRows: ReadonlyArray<PivotRowLike> | null | undefined,
    referencesKey: string,
): Map<string, string | number> {
    const map = new Map<string, string | number>()
    if (!pivotRows || !referencesKey) return map
    for (const row of pivotRows) {
        const target = row[referencesKey]
        if (target === undefined || target === null || target === '') continue
        if (row.id === undefined || row.id === null || row.id === '') continue
        map.set(String(target), row.id as string | number)
    }
    return map
}

/**
 * Diffs the previous selection against the next one and returns the work to
 * apply: target ids that need a POST (toAdd) and ids that need a DELETE
 * (toRemove). Both arrays are deduped and order-stable to make tests
 * deterministic.
 */
export function diffSelection(
    prev: ReadonlyArray<string>,
    next: ReadonlyArray<string>,
): { toAdd: string[]; toRemove: string[] } {
    const prevSet = new Set(prev)
    const nextSet = new Set(next)
    const toAdd: string[] = []
    for (const id of next) {
        if (!prevSet.has(id) && !toAdd.includes(id)) toAdd.push(id)
    }
    const toRemove: string[] = []
    for (const id of prev) {
        if (!nextSet.has(id) && !toRemove.includes(id)) toRemove.push(id)
    }
    return { toAdd, toRemove }
}

/**
 * Picks a human-readable label for a target row. Tries `displayKey` first,
 * then walks the metadata columns in order looking for the first non-id /
 * non-FK string-ish value. Falls back to the row id, then to '—'.
 */
export function pickOptionLabel(
    row: TargetRowLike | null | undefined,
    displayKey: string | undefined,
    columns: ReadonlyArray<ColumnDefinition> | null | undefined,
): string {
    if (!row) return '—'
    if (displayKey) {
        const v = row[displayKey]
        if (v !== undefined && v !== null && v !== '') return String(v)
    }
    if (columns) {
        for (const col of columns) {
            if (col.key === 'id' || col.hidden) continue
            const v = row[col.key]
            if (v === undefined || v === null || v === '') continue
            if (typeof v === 'object') continue
            return String(v)
        }
    }
    if (row.id !== undefined && row.id !== null && row.id !== '') return String(row.id)
    return '—'
}
