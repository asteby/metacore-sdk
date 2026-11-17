import type { Severity } from '@asteby/metacore-ui/layout'

/** `cards` and `table` are built in; `map` (and anything else) is a host/addon renderer. */
export type ViewModeKey = 'cards' | 'table' | 'map' | (string & {})

export interface ViewModeDef {
    key: ViewModeKey
    /** Label override from the manifest (e.g. "Hallazgos", "Pedidos"). Absent -> default i18n label. */
    label?: string
    /** Lucide icon name override. */
    icon?: string
}

export interface CardFieldSpec {
    field: string
    /** i18n key or literal shown before the value in meta rows. */
    label?: string
    format?: 'text' | 'date' | 'datetime' | 'number' | 'currency' | 'percent'
}

/** Manifest-declared card: no per-addon code. */
export interface CardSpec {
    title: string
    subtitle?: string
    /** Priority/severity badge: value -> tone, optional value -> label. */
    badge?: { field: string; tones?: Record<string, Severity>; labels?: Record<string, string> }
    /** Fields rendered as small chips (status, territory...). */
    chips?: string[]
    /** Secondary metadata rows. */
    meta?: CardFieldSpec[]
}

export interface QuickFilterDef {
    key: string
    /** Label (already translated or an i18n key). */
    label: string
    /** Column -> filter value (same shape as DynamicTable `defaultFilters`, e.g. { status: 'EQ:human_review' }). Empty = "Todos". */
    params: Record<string, string>
}

export interface SortSpec {
    field: string
    dir: 'asc' | 'desc'
    /** Human label for the counter ("prioridad"). */
    label?: string
}

/** The one filter state shared by EVERY mode (cards, table, map). */
export interface ViewState {
    search: string
    /** Active quick-filter key; '' = none/"Todos". */
    quick: string
    /** Extra column filters (`f_<col>` on the wire). */
    filters: Record<string, string>
    sort?: { field: string; dir: 'asc' | 'desc' }
}

export interface SavedView {
    id: string
    name: string
    state: ViewState
    mode?: ViewModeKey
}
