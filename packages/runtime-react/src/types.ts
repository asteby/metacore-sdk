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
}

export interface ActionCondition {
    field: string
    operator: 'eq' | 'neq' | 'in' | 'not_in'
    value: string | string[]
}

// Mirrors `ValidationRule` from packages/sdk/src/generated/manifest.ts. Kept
// inline here so runtime-react does not import generated kernel types directly
// — apps and addons author ActionFieldDef literals.
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
    | 'switch'

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
}
