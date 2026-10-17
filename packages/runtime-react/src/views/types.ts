// Declarative view contract (levels A/B of the UI spectrum): the kernel types
// (NavView, MapView, TimelineView, CalendarView, ChartView, SplitView,
// DetailPanel…) come generated from the kernel through @asteby/metacore-sdk;
// this file only adds the renderer-side props and the data source the host
// injects. Type-only: costs 0 bytes in the bundle.
import type { ComponentType } from 'react'
import type {
    CalendarView,
    ChartView,
    DetailPanel,
    MapView,
    SplitView,
    TimelineView,
    WidgetQuery,
} from '@asteby/metacore-sdk'
import type { TableMetadata } from '../types'
import type { WidgetData } from '../dashboard-types'

/** `view_type` values rendered by a declarative renderer (table/kanban excluded). */
export type DeclarativeViewType = 'map' | 'timeline' | 'calendar' | 'chart' | 'split'

/** Block of `NavView` each type reads. */
export interface DeclarativeViewConfig {
    map: MapView
    timeline: TimelineView
    calendar: CalendarView
    chart: ChartView
    split: SplitView
}

/** A page of rows. */
export interface ViewRows<Row = Record<string, unknown>> {
    rows: Row[]
    total?: number
}

/** List params in the kernel's list syntax (`f_<col>`, `sortBy`, `order`…). */
export type ViewListParams = Record<string, string | number | boolean | undefined>

/**
 * Where declarative renderers read data. The host provides it (default:
 * {@link createApiViewDataSource} over the runtime-react ApiClient). Every
 * call runs with the viewer's permissions server-side; renderers never
 * compute business values (totals, ETAs) — they display what comes back.
 */
export interface ViewDataSource {
    /** Rows of a model (`GET /data/<model>`). */
    list(model: string, params?: ViewListParams): Promise<ViewRows>
    /** One record (`GET /data/<model>/<id>`). */
    record(model: string, id: string): Promise<Record<string, unknown> | null>
    /**
     * Aggregate for a chart view or panel. The host must only answer queries
     * the installed manifests declare (same rule as dashboard widgets): the
     * request names the model and the declared query, never free SQL.
     */
    chart(req: ChartRequest): Promise<WidgetData>
    /** Capability query (timeline panels with `source.capability`). */
    capability(key: string, input: Record<string, unknown>): Promise<unknown>
}

export interface ChartRequest {
    /** Model whose nav entry / detail declares the chart. */
    model: string
    query: WidgetQuery
    /** Detail panels: the relation the query is scoped to, and the record. */
    relation?: string
    recordId?: string
    /** Detail panels: the panel key; nav views: undefined. */
    panelKey?: string
}

/** Props every declarative view renderer receives. */
export interface ViewRendererProps<T extends DeclarativeViewType = DeclarativeViewType> {
    model: string
    view: DeclarativeViewConfig[T]
    /** Served table metadata (columns, relations, options…), when loaded. */
    metadata?: TableMetadata | null
    data: ViewDataSource
    /** Open a record (host route to its detail page or drawer). */
    onOpenRecord?: (row: Record<string, unknown>) => void
    locale?: string
    currency?: string
    timeZone?: string
    className?: string
}

/** Props every detail panel renderer receives. */
export interface PanelRendererProps {
    model: string
    panel: DetailPanel
    record: Record<string, unknown>
    metadata?: TableMetadata | null
    data: ViewDataSource
    locale?: string
    currency?: string
    timeZone?: string
    onOpenRecord?: (model: string, row: Record<string, unknown>) => void
}

export type ViewRendererComponent = ComponentType<ViewRendererProps<any>>
export type PanelRendererComponent = ComponentType<PanelRendererProps>

/** Lazy module of a renderer (default export = the component). */
export type ViewRendererLoader = () => Promise<{ default: ViewRendererComponent }>
export type PanelRendererLoader = () => Promise<{ default: PanelRendererComponent }>
