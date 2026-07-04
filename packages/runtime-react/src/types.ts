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
    /**
     * Which renderer the host should use for this view. `'table'` (default, or
     * absent) → `DynamicTable`; `'kanban'` → `DynamicKanban`. Served by the
     * kernel from the nav item's `view_type` (RFC §1.2). Purely additive — older
     * kernels omit it and the SDK falls back to the table renderer.
     */
    view_type?: 'table' | 'kanban' | (string & {})
    /**
     * Column key the board groups by when `view_type === 'kanban'` (the stage
     * column, e.g. `'stage'`). Each distinct value of this column becomes a board
     * lane. Mirrors the nav item's `group_by` (RFC §1.2).
     */
    group_by?: string
    /**
     * Board lanes (the stage machine of the `group_by`/`stage_field` column).
     * When present the kanban renders one lane per stage in `order`. When absent
     * the SDK derives lanes from the `group_by` column's `options` (the kernel
     * already projects `stages[]` onto the status display — RFC §1.1). Snake_case
     * keys as the kernel serves them.
     */
    stages?: StageMeta[]
    /**
     * Virtual "smart" lanes (ops #704): read-only board columns defined by a set
     * of filters rather than a stored stage value. When present the kanban paints
     * one lane per entry (querying the list with the lane's filters) after the
     * real stages. Purely additive — absent on hosts without custom stages.
     */
    smart_lanes?: SmartLaneMeta[]
    /**
     * Allowed stage transitions (RFC §1.1). When present, the kanban only lets a
     * card drop into a lane reachable from its current stage; disallowed lanes
     * are dimmed and reject the drop. `from`/`to` accept `'*'` as a wildcard.
     * Absent → any move is allowed (the kernel still validates server-side).
     */
    transitions?: StageTransition[]
}

/**
 * One board lane / pipeline stage. Mirrors the kernel v3 `Stage` (RFC §1.1).
 * `color` is a semantic palette name (`'slate'`, `'blue'`, `'amber'`, `'green'`)
 * or a hex literal — resolved through the same `generateBadgeStyles` helper as
 * option badges. `is_final` flags a terminal stage (e.g. "Done").
 */
export interface StageMeta {
    key: string
    label: string
    color?: string
    order?: number
    is_final?: boolean
    /**
     * True when the kernel merged a user-defined custom stage into `stages[]`
     * (ops #704). Behaves as a normal droppable lane; the SDK just grows an
     * Editar/Eliminar menu on it.
     */
    custom?: boolean
    /**
     * True when a per-org stage override (label/color/conditions) has been
     * applied to this DECLARED lane (ops stage-overrides). The kernel serves the
     * lane already carrying the overridden label/color; this flag only drives the
     * "Restablecer etapa" affordance in the config dialog. Absent on hosts without
     * stage overrides — purely additive.
     */
    overridden?: boolean
    /**
     * Extra per-lane conditions layered on top of the stage's own `group_by`
     * scope (ops stage-overrides). When present the lane queries its data — and
     * counts its header — with the stage filter PLUS these conditions (serialized
     * the same way as smart-lane filters). The lane stays a normal drop target;
     * dropping a card only sets the stage value. Absent → the lane behaves as a
     * plain declared stage. Snake_case ops as the kernel serves them.
     */
    filters?: { field: string; op: string; value: string }[]
    /**
     * The manifest ORIGINAL (pre-override) label/color/conditions, served
     * alongside an overridden declared lane so the "Restablecer al original"
     * confirm can spell out exactly what reverts. Optional — hosts that don't
     * snapshot the original simply omit it and the SDK shows a generic confirm.
     */
    original?: {
        label?: string
        color?: string
        filters?: { field: string; op: string; value: string }[]
    }
}

/**
 * A virtual "smart" lane (ops #704) served in `TableMetadata.smart_lanes`. It's
 * defined by `filters` (never a stored stage value), so the board paints it by
 * querying the list with those conditions. Read-only — not a drop target.
 */
export interface SmartLaneMeta {
    key: string
    label: string
    color?: string
    order?: number
    filters: { field: string; op: string; value: string }[]
}

/** Allowed `from → to` stage transition (RFC §1.1). `'*'` is a wildcard. */
export interface StageTransition {
    from: string
    to: string
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
    /**
     * `dynamic_select` resolves its options server-side from a relation
     * (`searchEndpoint = /options/<ref>`) and renders the same multi-value
     * combobox as `select`. The host loads + caches the options before they
     * surface in the dropdown.
     */
    type: 'select' | 'dynamic_select' | 'boolean' | 'date_range' | 'number_range' | 'text'
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
    type:
        | 'text'
        | 'number'
        | 'date'
        // Timestamp variants. They share the `date` cell renderer but append
        // the time + a full-precision tooltip (see formatDateCell).
        | 'datetime'
        | 'timestamp'
        | 'timestamptz'
        | 'select'
        | 'search'
        | 'relation-badge-list'
        | 'avatar'
        | 'boolean'
        | 'phone'
        | 'media-gallery'
        | 'image'
        // Declarative pro cell renderers (resolved via `cellStyle ?? type`).
        | 'url'
        | 'link'
        | 'email'
        | 'currency'
        | 'percent'
        | 'progress'
        | 'badge'
        | 'status'
        | 'tags'
        | 'color'
        | 'code'
        | 'truncate-text'
        | 'creator'
        | 'user'
        // Resolved FK relation chip. The data row carries a sibling
        // `{ value, label }` object keyed by the column key with the trailing
        // `_id` stripped (e.g. `category_id` → `row.category`). Also triggered
        // implicitly whenever the column carries a `ref` (belongs_to FK).
        | 'relation'
    sortable: boolean
    filterable: boolean
    /**
     * Explicit filter UI the backend wants for this column when `filterable`.
     * When absent the SDK infers it from the column shape (options/endpoint →
     * `select`, boolean/number/date → their range pickers, else `text`). A
     * `ref` (belongs_to FK) column is served as `dynamic_select` so its options
     * stream from `searchEndpoint = /options/<ref>` into a multi-value combobox.
     */
    filterType?: 'select' | 'dynamic_select' | 'boolean' | 'date_range' | 'number_range' | 'text'
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
    /**
     * Declared schema for a jsonb line-items column (kernel v3 `item_fields`).
     * Each entry describes one sub-field of the array's row objects: a `key`
     * (the jsonb key), an already-LOCALIZED `label` (backend-translated), an
     * optional `type` hint and an optional `ref` (FK target). When present the
     * `CollectionCell` renders the popover mini-table with these headers in
     * order and resolves `ref` columns to the backend-injected sibling label
     * (the FK key without `_id`, else `<key>_label`) instead of the raw uuid.
     * Tolerates the snake_case `item_fields` the kernel serves.
     */
    itemFields?: ColumnItemField[]
    /** snake_case alias served by the kernel for `itemFields`. */
    item_fields?: ColumnItemField[]
}

/**
 * One declared sub-field of a jsonb line-items column (see
 * `ColumnDefinition.itemFields`). `label` is already localized by the backend
 * and consumed verbatim; a non-empty `ref` flags the column for resolved-label
 * rendering against the injected sibling. Structurally compatible with the
 * `ItemField` consumed by `collection-cell`.
 */
export interface ColumnItemField {
    key: string
    label: string
    type?: string
    ref?: string
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
     * snake_case aliases the kernel manifest may serve for a belongs_to FK
     * target instead of `ref`. Treated as equivalent to `ref` by the SDK so a
     * declared relation renders a searchable picker regardless of which key the
     * backend emits.
     */
    source?: string
    relation?: string
    /**
     * Cascade dependency: the key of ANOTHER field in the same action form
     * (a header field or a sibling item-field) whose current value supplies
     * this picker's `filter_value`. While the depended-on field is empty the
     * picker is disabled with a hint; once it has a value the picker fetches
     * options scoped by it and re-fetches whenever it changes (clearing the
     * current selection). Without `dependsOn` the picker lists everything
     * (retrocompat). Tolerates the snake_case `depends_on` the kernel serves.
     */
    dependsOn?: string
    /** snake_case alias served by the kernel manifest for `dependsOn`. */
    depends_on?: string
    /**
     * Enriched options routing the kernel serves for a dependent/scoped picker.
     * When it carries a `source`, the picker queries that source MODEL (not the
     * field's `ref`): URL `/options/<source>`, query field = `value` (falling
     * back to the field's own key), and the cascade `filter_value` is the value
     * of the `dependsOn` field. `description` is projected into the option
     * subtitle. Tolerates the snake_case `options_config` the kernel emits.
     * Absent → the picker keeps its `ref`-based behaviour (retrocompat).
     */
    optionsConfig?: FieldOptionsConfig
    /** snake_case alias served by the kernel manifest for `optionsConfig`. */
    options_config?: FieldOptionsConfig
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

/**
 * Enriched options-resolution config the kernel attaches to a dependent/scoped
 * picker field (json `options_config`). When `source` is present the SDK queries
 * the source model instead of the field's `ref`. All keys are snake_case as the
 * kernel serves them; the SDK reads them as-is via `getOptionsConfig`.
 */
export interface FieldOptionsConfig {
    /** Discriminator the kernel sets (e.g. `'dynamic'`). Informational. */
    type?: string
    /** Source MODEL the candidates come from → URL `/options/<source>`. */
    source?: string
    /** Column of `source` compared against the cascade `filter_value`. */
    filter_by?: string
    /** Column of `source` used as the option value → query `?field=<value>`. */
    value?: string
    /** Related model used to resolve the option label by id (host-side enrich). */
    label_ref?: string
    /** Column of `source` projected into `option.description` (e.g. qty). */
    description?: string
    /** Optional ordering column. */
    order_by?: string
    /** Optional column projected into `option.image`. */
    image?: string
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
