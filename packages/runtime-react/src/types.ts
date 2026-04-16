// Union of the two host copies (link + ops). Ops adds the `link` action type + `linkUrl`.
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

export interface ColumnDefinition {
    key: string
    label: string
    type: 'text' | 'number' | 'date' | 'select' | 'search' | 'relation-badge-list' | 'avatar' | 'boolean' | 'phone' | 'media-gallery' | 'image'
    sortable: boolean
    filterable: boolean
    hidden?: boolean
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

export interface ActionFieldDef {
    key: string
    label: string
    type: string
    required?: boolean
    options?: { value: string; label: string }[]
    defaultValue?: any
    placeholder?: string
    searchEndpoint?: string
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
