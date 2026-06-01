// Shared metadata shape consumed by every host. Some hosts add a `link`
// action type with a `linkUrl` template — represented here as part of the
// `type` union so the SDK can render it uniformly.
export interface TableMetadata {
    title: string
    endpoint: string
    columns: ColumnDefinition[]
    actions: ActionDefinition[]
    filters?: FilterDefinition[]
    perPageOptions: number[]
    defaultPerPage: number
    searchPlaceholder: string
    enableCRUDActions: boolean
    hasActions: boolean
    canExport?: boolean
    canImport?: boolean
    canCreate?: boolean
    /**
     * Child relations of this model, served by the kernel (>= v0.41.0). A
     * generic detail page renders one `DynamicRelation` panel per entry via
     * `<DynamicRelations>` to surface, e.g., a Customer's vehicles, addresses
     * and attachments. Absent on hosts/older kernels — purely additive.
     */
    relations?: RelationMeta[]
}

/**
 * Describes one child relation of a parent model, mirroring the kernel
 * `RelationMeta` shape (>= v0.41.0). Drives the metadata-driven
 * `<DynamicRelations>` panel list. All keys are snake_case as served by the
 * kernel; the SDK reads them as-is.
 */
export interface RelationMeta {
    /** Stable identifier for the relation (used as a React key / data attr). */
    name: string
    /** Cardinality. The SDK maps this onto `DynamicRelation.kind`. */
    kind: 'one_to_many' | 'many_to_many'
    /**
     * Child model key (the `through` model). For one_to_many this is the model
     * whose rows are listed; for many_to_many it is the pivot table.
     */
    through: string
    /** Child column holding the FK back to the parent. */
    foreign_key: string
    /**
     * Static equality filters applied on top of the foreign-key scope. Used for
     * polymorphic children (e.g. `{ "owner_model": "Customer" }`) so a shared
     * attachments/addresses table is narrowed to this parent's rows. Each entry
     * becomes a `f_<col>=eq:<val>` query param.
     */
    scope?: Record<string, string>
    /** Human-readable panel header. */
    label?: string
}

export interface FilterDefinition {
    key: string
    label: string
    type: 'select' | 'boolean' | 'date_range' | 'number_range' | 'text'
    column: string
    options?: { value: string | boolean; label: string; icon?: string; color?: string }[]
    searchEndpoint?: string
}

/**
 * Where a column is rendered. Mirrors `manifest.ColumnDef.Visibility` in the
 * kernel:
 *   - `''` / `'all'` — visible everywhere (default).
 *   - `'table'`     — only the list/index page.
 *   - `'modal'`     — only the create/edit modal.
 *   - `'list'`      — only API list payloads (omitted from UI).
 * Hosts may extend the union with their own scopes; the SDK only acts on the
 * canonical values above.
 */
export type ColumnVisibility = 'all' | 'table' | 'modal' | 'list' | (string & {})

export interface ColumnDefinition {
    key: string
    label: string
    type: 'text' | 'number' | 'date' | 'select' | 'search' | 'relation-badge-list' | 'avatar' | 'boolean' | 'phone' | 'media-gallery' | 'image'
    sortable: boolean
    filterable: boolean
    hidden?: boolean
    /**
     * Scopes where this column is rendered. When `'modal'` (or `'list'`) the
     * column is hidden from the table even if `hidden` is unset. Empty/`'all'`/
     * `'table'` keep the column visible. See `column-visibility.ts`.
     */
    visibility?: ColumnVisibility
    /**
     * Opts the column into the model's full-text/contains search. Independent
     * of `filterable` (which drives column-level filter chips). When at least
     * one column declares `searchable`, the SDK narrows the global search to
     * those columns; otherwise legacy "search every column" behaviour applies.
     */
    searchable?: boolean
    styleConfig?: Record<string, any>
    tooltip?: string
    description?: string
    cellStyle?: string
    searchEndpoint?: string
    filterField?: string
    basePath?: string
    displayField?: string
    iconField?: string
    relationPath?: string
    useOptions?: boolean
    options?: { value: string; label: string; icon?: string; color?: string }[]
    /**
     * FK target model. When the kernel auto-derives this from a
     * belongs_to relation (or an author sets it explicitly), the SDK
     * resolves the column's options against `/api/options/<ref>?field=id`
     * via `useOptionsResolver`. Wins over `searchEndpoint` for select
     * widgets — `searchEndpoint` stays as the legacy escape hatch.
     */
    ref?: string
    /**
     * Server-side validation rules the SDK can also pre-flight in the
     * form layer. `custom` may be a literal slug or a $org.<key>
     * reference resolved through the OrgConfigProvider.
     */
    validation?: FieldValidation
}

export interface ActionCondition {
    field: string
    operator: 'eq' | 'neq' | 'in' | 'not_in'
    value: string | string[]
}

// Mirrors `ValidationRule` from packages/sdk/src/generated/manifest.ts. Kept
// inline here so runtime-react does not import generated kernel types directly
// — apps and addons author ActionFieldDef literals.
//
// `custom` accepts either a literal validator slug (e.g. `mx.rfc`) registered
// via `registerValidator`, or a `$org.<key>` reference resolved through the
// OrgConfigProvider — same contract as kernel ColumnDef.Validation.Custom.
export interface FieldValidation {
    regex?: string
    min?: number
    max?: number
    custom?: string
}

// Widget hints for the form renderer. Subset that DynamicForm knows how to
// render today; unknown values fall back to the `type`-based default.
export type FieldWidget =
    | 'text'
    | 'textarea'
    | 'richtext'
    | 'color'
    | 'number'
    | 'date'
    | 'select'
    | 'dynamic_select'
    | 'switch'
    | 'upload'

export interface ActionFieldDef {
    key: string
    label: string
    type: string
    required?: boolean
    options?: { value: string; label: string }[]
    defaultValue?: any
    placeholder?: string
    searchEndpoint?: string
    validation?: FieldValidation
    widget?: FieldWidget | string
    /**
     * FK target model — same semantics as ColumnDefinition.ref. When
     * present, DynamicForm resolves the field's options through
     * `useOptionsResolver` against `/api/options/<ref>?field=id`.
     */
    ref?: string
    /**
     * Columns of a repeatable line-items group. Mirrors the kernel v3
     * `ActionField.item_fields` (json `item_fields`). Present on a field
     * with `type: "array"` — the multi-row container (e.g. the item rows
     * of a "Recibir mercancía" modal, or the debit/credit lines of a
     * journal entry). Each entry is itself an ActionFieldDef describing
     * one column's cell widget. The field value is an array of objects
     * keyed by these item field keys. Rendered by `DynamicLineItems`.
     */
    itemFields?: ActionFieldDef[]
    /**
     * On an `itemFields` column: flags the column for summation in the
     * line-items footer. The SDK renders a totals row summing every numeric
     * column marked `total` (e.g. the debit and credit columns of a journal
     * entry). Ignored on flat fields. Mirrors kernel v3 `ActionField.total`.
     */
    total?: boolean
    /**
     * On a line-items (`type: "array"`) field: declares an optional, generic
     * balance constraint between two summed columns. The SDK shows a balanced /
     * out-of-balance indicator and blocks submit until the two sides match.
     * Domain-agnostic — "debit"/"credit" are just the two column keys to
     * reconcile. Mirrors kernel v3 `ActionField.balance`.
     */
    balance?: FieldBalanceRule
    /**
     * `upload` widget: comma-separated accept list forwarded to the file input
     * `accept` attribute (e.g. `"image/*,.pdf"`). Tolerates the snake_case the
     * kernel may serve. Optional — when absent any file type is allowed.
     */
    accept?: string
    /**
     * `upload` widget: maximum file size in bytes. The renderer rejects larger
     * files client-side before POSTing. Tolerates kernel snake_case `max_size`.
     */
    maxSize?: number
    /** snake_case alias served by the kernel manifest for `maxSize`. */
    max_size?: number
    /**
     * `upload` widget: server-side storage bucket/prefix the host writes the
     * file under, forwarded to the upload endpoint as `storage_path`. Tolerates
     * kernel snake_case `storage_path`.
     */
    storagePath?: string
    /** snake_case alias served by the kernel manifest for `storagePath`. */
    storage_path?: string
}

/**
 * Declarative reconciliation constraint on a line-items field: the summed value
 * of `debitColumn` across all rows must equal the summed value of
 * `creditColumn`. Tolerates the snake_case shape the kernel serves
 * (`debit_column` / `credit_column` / `require_nonzero`). Generic by design.
 */
export interface FieldBalanceRule {
    debitColumn?: string
    creditColumn?: string
    /** snake_case alias served by the kernel manifest. */
    debit_column?: string
    /** snake_case alias served by the kernel manifest. */
    credit_column?: string
    message?: string
    /** When true (default) an all-zero entry is treated as out of balance. */
    requireNonzero?: boolean
    require_nonzero?: boolean
}

export interface ActionDefinition {
    key: string
    name: string
    label: string
    icon: string
    class: string
    color?: string
    type: 'view' | 'edit' | 'delete' | 'custom' | 'link'
    linkUrl?: string
    condition?: ActionCondition
    confirm?: boolean
    confirmMessage?: string
    fields?: ActionFieldDef[]
    requiresState?: string[]
    executable?: boolean
    /**
     * Where the host surfaces the trigger. Mirrors manifest/v3 Action.placement.
     *   "row" (default) — per-row table action.
     *   "table"         — page toolbar button (no record context).
     *   "create"        — toolbar button that replaces the generic create button.
     */
    placement?: 'row' | 'table' | 'create'
}

export interface ApiResponse<T> {
    success: boolean
    data: T
    meta?: PaginationMeta
    filters?: Record<string, any>
    message?: string
}

export interface PaginationMeta {
    current_page: number
    from: number
    last_page: number
    per_page: number
    to: number
    total: number
}

// ActionMetadata re-exported from the sdk's action-registry. We mirror the
// subset needed for the dispatcher so consumers of runtime-react don't have to
// import the sdk directly for prop typings.
export interface ActionMetadata {
    key: string
    label: string
    icon: string
    color?: string
    confirm?: boolean
    confirmMessage?: string
    fields?: ActionFieldDef[]
    requiresState?: string[]
    executable?: boolean
    placement?: 'row' | 'table' | 'create'
}
