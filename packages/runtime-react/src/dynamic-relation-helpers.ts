// Pure helpers for DynamicRelation. Live in their own module so unit tests
// run in node (no DOM, no metacore-ui primitives) and consumers can reuse the
// URL/payload conventions outside the component.
import type { ActionFieldDef, ColumnDefinition, TableMetadata } from './types'
import { isNilUuid } from './nil-uuid'
import { humanizeToken } from './dynamic-columns-helpers'

// An enum-like column renders a single token value (status/select/option/badge)
// rather than free text, so an unmatched value should be humanized, not leaked.
function isEnumLikeColumn(col: ColumnDefinition): boolean {
    const renderAs = col.cellStyle ?? col.type
    return (
        renderAs === 'select' ||
        renderAs === 'option' ||
        renderAs === 'status' ||
        renderAs === 'badge' ||
        !!col.options?.length
    )
}

export type DynamicRelationKind = 'one_to_many' | 'many_to_many'

// Pulls a human label off a resolved relation/user object a backend serves:
// `{ value, label }` (FK sibling), `{ name, … }` (user object such as
// created_by) or `{ title }`. Returns undefined for plain/empty objects so the
// caller falls through to its empty marker instead of leaking raw JSON.
export function objectLabel(value: unknown): string | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const obj = value as Record<string, unknown>
    const label = obj.label ?? obj.name ?? obj.title
    return label != null && label !== '' ? String(label) : undefined
}

// formatRelationCell renders one DynamicRelation row cell. Beyond coercing
// scalars it resolves the pro siblings a backend serves so a line-item shows
// "Test", not a raw uuid or `{"label":"Test",…}` JSON:
//   1. an FK column (`product_id`) → the sibling `row.product = { value, label }`
//      (the key with the trailing `_id` stripped), preferring its label/name;
//   2. a value that is itself a resolved object (`{ value, label }` / a user
//      `{ name }`) → its label/name, never `JSON.stringify`;
//   3. the nil/zero UUID (unset nullable FK) → the empty marker "—".
export function formatRelationCell(row: Record<string, unknown>, col: ColumnDefinition): string {
    const value = row[col.key]

    // Prefer the backend-resolved FK sibling keyed by the column key with the
    // trailing `_id` stripped (`product_id` → `row.product`).
    if (col.key.endsWith('_id')) {
        const sibling = row[col.key.slice(0, -3)]
        const siblingLabel =
            objectLabel(sibling) ??
            (typeof sibling === 'string' && sibling !== '' && !isNilUuid(sibling) ? sibling : undefined)
        if (siblingLabel !== undefined) return siblingLabel
    }

    if (value === null || value === undefined) return '—'
    if (isNilUuid(value)) return '—'
    if (typeof value === 'boolean') return value ? '✓' : '—'

    // The cell value is itself a resolved relation/user object → its label/name.
    const inlineLabel = objectLabel(value)
    if (inlineLabel !== undefined) return inlineLabel
    // An object with no usable label (would JSON.stringify) → empty marker.
    if (typeof value === 'object') return '—'

    const text = String(value)
    if (text === '') return '—'
    // Enum/status/option columns: prefer the declared option label (localized
    // source of truth), then humanize the raw token as a fallback so a status
    // never reads as `in_progress`. Plain text columns are left untouched.
    if (isEnumLikeColumn(col)) {
        const match = col.options?.find((o) => String(o.value) === text)
        if (match) return match.label
        return humanizeToken(text)
    }
    return text
}

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
    extraFilters?: Record<string, string> | null,
): Record<string, string> {
    if (!foreignKey) throw new Error('foreignKey requerido')
    if (parentId === undefined || parentId === null || parentId === '') {
        throw new Error('parentId requerido')
    }
    const params: Record<string, string> = {
        [`f_${foreignKey}`]: `eq:${String(parentId)}`,
    }
    // Additional static-equality scope columns (polymorphic case: the FK plus
    // e.g. owner_model=Customer). Each becomes its own `f_<col>=eq:<val>` param.
    // The foreign-key entry above wins if a caller redundantly repeats it.
    if (extraFilters) {
        for (const [col, val] of Object.entries(extraFilters)) {
            if (!col || col === foreignKey) continue
            if (val === undefined || val === null) continue
            params[`f_${col}`] = `eq:${String(val)}`
        }
    }
    return params
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
            // Carry the FK target through so a belongs_to column renders the
            // async searchable picker (resolveWidget → 'dynamic_select') rather
            // than a raw uuid text input. Without this the column lost its `ref`
            // crossing the column→field boundary and degraded to plain text.
            ref: col.ref,
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
        // Media columns map to the upload widget (resolveWidget → 'upload') so an
        // image/photo column gets the file dropzone instead of a text input.
        case 'image': return 'image'
        case 'media-gallery': return 'media'
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
