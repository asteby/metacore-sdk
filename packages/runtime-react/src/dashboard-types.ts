// Dashboard widget types — the SDK-facing surface of the modular dashboard
// contract (CONTRACT-dashboard-widgets.md §1, §3, §4). The host (ops/kernel)
// computes the data and ships the specs as raw i18n keys; the SDK renders.
//
// These mirror the v3 `contributions.dashboard[]` shape so a host can forward
// the backend response straight into <DashboardGrid> without remapping.

/** Widget renderer kinds. `custom` defers to a federated slot component. */
export type WidgetKind =
    | 'stat'
    | 'bar'
    | 'line'
    | 'area'
    | 'pie'
    | 'donut'
    | 'list'
    | 'progress'
    | 'custom'

/** Grid footprint in a 4-column grid: sm=1, md=2, lg=3, full=4. */
export type WidgetSize = 'sm' | 'md' | 'lg' | 'full'

/** Value format applied to the scalar value and to series values. */
export type WidgetFormat = 'number' | 'currency' | 'percent' | 'compact'

/** Accent color token (theme CSS vars). */
export type WidgetAccent =
    | 'emerald'
    | 'sky'
    | 'violet'
    | 'amber'
    | 'rose'
    | 'slate'

/** Aggregation kinds for declarative queries. */
export type WidgetAggregate = 'count' | 'sum' | 'avg' | 'min' | 'max'

/** Where-clause operators (mirror the list builder). */
export interface WidgetWhereOp {
    eq?: unknown
    neq?: unknown
    gt?: unknown
    gte?: unknown
    lt?: unknown
    lte?: unknown
    contains?: unknown
}

/**
 * Declarative aggregation query (kinds other than `custom`). The host resolves
 * the logical table from `model` and computes the aggregate org-scoped.
 */
export interface DashboardWidgetQuery {
    model: string
    aggregate: WidgetAggregate
    field?: string
    where?: Record<string, unknown | WidgetWhereOp>
    group_by?: string
    label_field?: string
    date_field?: string
    interval?: 'day' | 'week' | 'month'
    range?:
        | 'this_day'
        | 'last_7_days'
        | 'last_30_days'
        | 'last_12_months'
        | 'this_month'
        | 'this_year'
        | 'all'
    order?: 'asc' | 'desc'
    limit?: number
}

/** Optional delta comparison against the previous window → `+14.2%` chip. */
export interface DashboardWidgetCompare {
    to: 'previous_period'
}

/**
 * A single dashboard widget spec (v3 contract §1). The host ships these as raw
 * i18n keys (`title`, `subtitle`, `group`, `empty`); the grid translates them.
 */
export interface DashboardWidgetSpec {
    /** Unique within the addon. Capability = `<addon>.dashboard.<key>`. */
    key: string
    /** i18n key for the title. */
    title: string
    /** i18n key for the subtitle. */
    subtitle?: string
    /** lucide icon slug. */
    icon?: string
    kind: WidgetKind
    size?: WidgetSize
    /** i18n key for the group heading. */
    group?: string
    /** Order within the group. */
    order?: number
    accent?: WidgetAccent
    format?: WidgetFormat
    /** Capability gating the widget (useCan). */
    permission?: string
    /** i18n key for the per-widget empty state. */
    empty?: string

    // declarative kinds
    query?: DashboardWidgetQuery
    compare?: DashboardWidgetCompare

    // custom (federated) kind
    slot?: string
    expose?: string
}

/** A bucket of an aggregated series. */
export interface WidgetSeriesPoint {
    key: string
    label: string
    value: number
}

/**
 * The computed data for one widget (CONTRACT §3). `value` for scalars,
 * `series` for bucketed/temporal aggregates, `delta` for the compare chip
 * (fraction, e.g. `0.142` → `+14.2%`).
 */
export interface WidgetData {
    value?: number
    delta?: number
    series?: WidgetSeriesPoint[]
}

/** A titled group of widgets (CONTRACT §3 — backend grouping/order). */
export interface DashboardWidgetGroup {
    /** i18n key for the group heading. */
    title: string
    widgets: DashboardWidgetSpec[]
}

/**
 * Loads the data for a batch of widget keys. The host runs the aggregation and
 * returns a `{ [key]: WidgetData }` map. Keys missing from the result render
 * their empty state.
 */
export type LoadWidgetData = (
    keys: string[],
) => Promise<Record<string, WidgetData>>

/** Props for <DashboardGrid>. */
export interface DashboardGridProps {
    /** Pre-grouped widgets (backend grouping/order). */
    groups?: DashboardWidgetGroup[]
    /** Flat widget list — grouped client-side by `group`/`order`. */
    widgets?: DashboardWidgetSpec[]
    /** Batch loader for widget data (org-scoped, host-side aggregation). */
    loadData: LoadWidgetData
    /** When true, bypass permission gating (admin/owner sees everything). */
    isAdmin?: boolean
    /** BCP-47 locale for number/currency/date formatting. */
    locale?: string
    /** ISO-4217 currency for `format: 'currency'` widgets. */
    currency?: string
    /** Extra class on the grid root. */
    className?: string
    /** Optional override for empty/loading/error copy. */
    strings?: Partial<DashboardGridStrings>
}

/** Translatable copy used by the grid chrome. Defaults are English. */
export interface DashboardGridStrings {
    /** Global empty state title (no widgets at all). */
    emptyTitle: string
    /** Global empty state description. */
    emptyDescription: string
    /** Per-widget error message. */
    widgetError: string
    /** Per-widget empty (no data) fallback when the spec has no `empty` key. */
    widgetEmpty: string
}
