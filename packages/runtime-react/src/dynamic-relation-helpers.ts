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

// Server-managed / audit columns that must never become editable form inputs.
// They're set by the backend and several ship as resolved objects (e.g.
// `created_by = { name, avatar, email }`) that would render as `[object Object]`.
const MANAGED_RELATION_COLUMNS = new Set([
    'id',
    'created_at',
    'updated_at',
    'deleted_at',
    'created_by',
    'created_by_id',
    'updated_by',
    'updated_by_id',
    'deleted_by',
    'deleted_by_id',
    'organization_id',
])

// isManagedRelationColumn: an audit/server column, including the dotted
// projections the backend serves for them (`created_by.avatar`, the creator
// avatar column every table gets). Any dotted key is a projection of another
// column, never an editable value of the row.
export function isManagedRelationColumn(key: string): boolean {
    const k = key.toLowerCase()
    if (k.includes('.')) return true
    return MANAGED_RELATION_COLUMNS.has(k)
}

const MEDIA_WIDGETS = new Set(['image', 'upload', 'photo', 'file', 'media'])
const IMAGE_CELL_STYLES = new Set(['image', 'image_stack'])

// relationMediaKind: 'image' / 'file' when a child column holds an uploaded
// file path (manifest `widget: image|upload|file`, `type: image`, or a ref-less
// column the backend renders as an image — `/metadata/table` carries the
// manifest `display: image_stack` as `cellStyle`, not the widget). A `ref`
// column is an FK picker (brand logo chip), never an upload.
export function relationMediaKind(col: ColumnDefinition): 'image' | 'file' | undefined {
    if (col.ref) return undefined
    const widget = String((col as ColumnDefinition & { widget?: string }).widget ?? '').toLowerCase()
    if (widget === 'file') return 'file'
    if (MEDIA_WIDGETS.has(widget)) return 'image'
    if (col.type === 'image') return 'image'
    if (IMAGE_CELL_STYLES.has(String(col.cellStyle ?? '').toLowerCase())) return 'image'
    return undefined
}

export type RelationDerive = 'image_width' | 'image_height' | 'next_position'

/**
 * Declarative form hints a child column carries in its manifest
 * `display_config` (served as `styleConfig`, no kernel field needed):
 *   - `form: "hidden"`            → never an input in the row form.
 *   - `derive: <RelationDerive>`  → not an input; filled by the SDK (image
 *     size measured in the browser on upload, next gallery position on create).
 *   - `default_from_parent: <k>`  → create-form initial value from the parent
 *     record's `<k>` (e.g. the product name as the image alt text), editable.
 *   - `empty_label: <text>`       → placeholder of an optional picker
 *     ("Para todas las variantes").
 *   - `gallery: true` (on the image column) → the relation renders as a
 *     thumbnail gallery instead of a table.
 * A column with none of them behaves exactly as before.
 */
export interface RelationColumnUi {
    form?: 'hidden' | 'advanced'
    derive?: RelationDerive
    defaultFromParent?: string
    emptyLabel?: string
    gallery?: boolean
}

const DERIVES = new Set<RelationDerive>(['image_width', 'image_height', 'next_position'])

export function relationColumnUi(col: ColumnDefinition): RelationColumnUi {
    const sc = (col.styleConfig ?? {}) as Record<string, unknown>
    const out: RelationColumnUi = {}
    const form = sc.form
    if (form === 'hidden' || form === 'advanced') out.form = form
    const derive = sc.derive
    if (typeof derive === 'string' && DERIVES.has(derive as RelationDerive)) out.derive = derive as RelationDerive
    const dfp = sc.default_from_parent ?? sc.defaultFromParent
    if (typeof dfp === 'string' && dfp.trim() !== '') out.defaultFromParent = dfp.trim()
    const empty = sc.empty_label ?? sc.emptyLabel
    if (typeof empty === 'string' && empty.trim() !== '') out.emptyLabel = empty
    if (sc.gallery === true) out.gallery = true
    return out
}

/** The gallery image column (media + `display_config.gallery: true`), if any. */
export function relationGalleryColumn(
    metadata: Pick<TableMetadata, 'columns'> | null | undefined,
): ColumnDefinition | undefined {
    return metadata?.columns?.find((c) => relationMediaKind(c) === 'image' && relationColumnUi(c).gallery === true)
}

export interface ImageMeta {
    width?: number
    height?: number
}

/**
 * Values the SDK fills for derived columns of a child row. `next_position`
 * only on create (an edit keeps the stored order); image size only when the
 * upload measured one. Never invents a value it does not know.
 */
export function relationDerivedValues(
    metadata: Pick<TableMetadata, 'columns'> | null | undefined,
    ctx: { isCreate: boolean; rows: Record<string, any>[]; image?: ImageMeta | null },
): Record<string, number> {
    const out: Record<string, number> = {}
    for (const col of metadata?.columns ?? []) {
        const d = relationColumnUi(col).derive
        if (d === 'next_position' && ctx.isCreate) out[col.key] = nextRelationPosition(ctx.rows, col.key)
        if (d === 'image_width' && ctx.image?.width) out[col.key] = Math.round(ctx.image.width)
        if (d === 'image_height' && ctx.image?.height) out[col.key] = Math.round(ctx.image.height)
    }
    return out
}

/** Create-form initial values copied from the parent (`default_from_parent`). */
export function relationInitialValues(
    metadata: Pick<TableMetadata, 'columns'> | null | undefined,
    parent: Record<string, unknown> | null | undefined,
): Record<string, any> {
    const out: Record<string, any> = {}
    if (!parent) return out
    for (const col of metadata?.columns ?? []) {
        const k = relationColumnUi(col).defaultFromParent
        if (!k) continue
        const v = parent[k]
        if (typeof v === 'string' && v !== '') out[col.key] = v
        else if (typeof v === 'number') out[col.key] = String(v)
    }
    return out
}

/** Key of the child model's ordering column (`position`), if it declares one. */
export function relationPositionKey(
    metadata: Pick<TableMetadata, 'columns'> | null | undefined,
): string | undefined {
    return metadata?.columns?.some((c) => c.key === 'position') ? 'position' : undefined
}

/** Rows sorted ascending by their position column; rows without one go last, stable. */
export function sortRelationRows<T extends Record<string, any>>(rows: T[], positionKey?: string): T[] {
    if (!positionKey) return rows
    const num = (r: T) => {
        const n = Number(r?.[positionKey])
        return r?.[positionKey] === null || r?.[positionKey] === undefined || r?.[positionKey] === '' || !Number.isFinite(n)
            ? Number.POSITIVE_INFINITY
            : n
    }
    return rows
        .map((r, i) => [r, i] as const)
        .sort((a, b) => num(a[0]) - num(b[0]) || a[1] - b[1])
        .map(([r]) => r)
}

/** Default position for a new child row: one past the highest loaded, 0 when empty. */
export function nextRelationPosition(rows: Record<string, any>[], positionKey = 'position'): number {
    let max = -1
    for (const r of rows) {
        const n = Number(r?.[positionKey])
        if (r?.[positionKey] !== null && r?.[positionKey] !== '' && Number.isFinite(n) && n > max) max = n
    }
    return max + 1
}

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
        // Managed/audit columns are server-owned and ship resolved objects
        // (`created_by = { name, avatar, … }`); making them editable inputs
        // renders `[object Object]`. Never surface them in the inline form.
        if (isManagedRelationColumn(col.key)) continue
        // Derived / hidden columns are filled by the SDK or the server, never
        // typed by whoever uploads a photo (width, height, position…).
        const ui = relationColumnUi(col)
        if (ui.form || ui.derive) continue
        const media = relationMediaKind(col)
        const accept = (col as ColumnDefinition & { accept?: string }).accept
        out.push({
            key: col.key,
            label: col.label,
            // A file/image column gets the same upload widget (with preview) as
            // the parent form, not a free-text path input.
            type: media ?? columnTypeToFieldType(col),
            ...(media === 'image' ? { accept: accept || 'image/*' } : accept ? { accept } : {}),
            ...(ui.emptyLabel ? { placeholder: ui.emptyLabel } : {}),
            required: false,
            options: col.options?.map(o => ({ value: String(o.value), label: o.label })),
            // Carry the FK target through so a belongs_to column renders the
            // async searchable picker (resolveWidget → 'dynamic_select') rather
            // than a raw uuid text input. Without this the column lost its `ref`
            // crossing the column→field boundary and degraded to plain text.
            ref: col.ref,
            // Columnas de solo lectura (escritas por el servidor/sistema): el
            // DynamicForm las oculta y no las manda en el submit. Sin copiarla,
            // el renglón las exponía editables y el PATCH las pisaba.
            ...(isReadonlyColumn(col) ? { readonly: true } : {}),
        })
    }
    return out
}

function isReadonlyColumn(col: ColumnDefinition): boolean {
    const c = col as ColumnDefinition & { readonly?: boolean; readOnly?: boolean; read_only?: boolean }
    return c.readonly === true || c.readOnly === true || c.read_only === true
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
