// Declarative view & panel renderer registry.
//
// Every renderer is a separate lazy chunk keyed by type: an addon that only
// declares a `timeline` never downloads the chart, calendar or map code, and
// none of them is in the host's first paint (the package index reaches this
// module, never the renderers — see __tests__/index-static-graph.test.ts).
//
// Built-in: chart, timeline, calendar, split (views) and map/timeline/chart/
// relation/stats (panels). `map` ships an accessible list fallback until a
// maps package registers the real renderer:
//
//   registerViewRenderer('map', () => import('@asteby/metacore-maps/view'))
//   registerPanelRenderer('map', () => import('@asteby/metacore-maps/panel'))
//
// `custom` panels (level C, a federated component) have no built-in: the host
// registers one that mounts the addon's expose.
import * as React from 'react'
import type { DetailPanel, NavView } from '@asteby/metacore-sdk'
import type {
    DeclarativeViewType,
    PanelRendererComponent,
    PanelRendererLoader,
    PanelRendererProps,
    ViewRendererComponent,
    ViewRendererLoader,
    ViewRendererProps,
} from './types'
import { FederatedErrorBoundary } from '../federated-error-boundary'
import { ViewSkeleton } from './skeleton'

export { ViewSkeleton }

export const DECLARATIVE_VIEW_TYPES: readonly DeclarativeViewType[] = [
    'map',
    'timeline',
    'calendar',
    'chart',
    'split',
] as const

export function isDeclarativeViewType(t: string | undefined | null): t is DeclarativeViewType {
    return !!t && (DECLARATIVE_VIEW_TYPES as readonly string[]).includes(t)
}

const viewLoaders = new Map<string, ViewRendererLoader>([
    ['chart', () => import('./chart-view')],
    ['timeline', () => import('./timeline-view')],
    ['calendar', () => import('./calendar-view')],
    ['split', () => import('./split-view')],
    ['map', () => import('./map-view')],
])

const panelLoaders = new Map<string, PanelRendererLoader>([
    ['chart', () => import('./chart-view').then((m) => ({ default: m.ChartPanel }))],
    ['timeline', () => import('./timeline-view').then((m) => ({ default: m.TimelinePanel }))],
    ['map', () => import('./map-view').then((m) => ({ default: m.MapPanel }))],
    ['relation', () => import('./panels').then((m) => ({ default: m.RelationPanelView }))],
    ['stats', () => import('./panels').then((m) => ({ default: m.StatsPanelView }))],
])

const lazyViews = new Map<string, React.LazyExoticComponent<ViewRendererComponent>>()
const lazyPanels = new Map<string, React.LazyExoticComponent<PanelRendererComponent>>()

/**
 * Register (or replace) the renderer of a view type. Returns a function that
 * restores the previous loader. Replacing drops the cached lazy component.
 */
export function registerViewRenderer(type: string, loader: ViewRendererLoader): () => void {
    const prev = viewLoaders.get(type)
    viewLoaders.set(type, loader)
    lazyViews.delete(type)
    return () => {
        if (prev) viewLoaders.set(type, prev)
        else viewLoaders.delete(type)
        lazyViews.delete(type)
    }
}

/** Register (or replace) the renderer of a detail panel kind (incl. `custom`). */
export function registerPanelRenderer(kind: string, loader: PanelRendererLoader): () => void {
    const prev = panelLoaders.get(kind)
    panelLoaders.set(kind, loader)
    lazyPanels.delete(kind)
    return () => {
        if (prev) panelLoaders.set(kind, prev)
        else panelLoaders.delete(kind)
        lazyPanels.delete(kind)
    }
}

export function hasViewRenderer(type: string): boolean {
    return viewLoaders.has(type)
}

export function hasPanelRenderer(kind: string): boolean {
    return panelLoaders.has(kind)
}

/** Warm a renderer chunk (hover/focus on a nav entry). Resolves false when none. */
export function preloadViewRenderer(type: string): Promise<boolean> {
    const loader = viewLoaders.get(type)
    return loader ? loader().then(() => true, () => false) : Promise.resolve(false)
}

function lazyView(type: string): React.LazyExoticComponent<ViewRendererComponent> | null {
    const loader = viewLoaders.get(type)
    if (!loader) return null
    let c = lazyViews.get(type)
    if (!c) {
        c = React.lazy(loader)
        lazyViews.set(type, c)
    }
    return c
}

function lazyPanel(kind: string): React.LazyExoticComponent<PanelRendererComponent> | null {
    const loader = panelLoaders.get(kind)
    if (!loader) return null
    let c = lazyPanels.get(kind)
    if (!c) {
        c = React.lazy(loader)
        lazyPanels.set(kind, c)
    }
    return c
}

export interface DeclarativeViewProps extends Omit<ViewRendererProps, 'view'> {
    viewType: DeclarativeViewType | string
    /** The nav entry's `view` block (served in the table metadata). */
    view: NavView | null | undefined
    /** Rendered when the type has no renderer or its block is missing. */
    fallback?: React.ReactNode
}

/**
 * Render a declarative view by type: picks `view[viewType]`, lazy-loads that
 * renderer, isolates it in an error boundary. Unknown types render `fallback`
 * (hosts pass the table, the same rule DynamicView applies).
 */
export function DeclarativeView({ viewType, view, fallback = null, ...rest }: DeclarativeViewProps) {
    const block = (view as Record<string, unknown> | null | undefined)?.[viewType]
    const Renderer = lazyView(viewType)
    if (!Renderer || !block) return <>{fallback}</>
    return (
        <FederatedErrorBoundary addonKey={`view:${viewType}`} resetKeys={[rest.model, viewType]}>
            <React.Suspense fallback={<ViewSkeleton />}>
                <Renderer {...rest} view={block} />
            </React.Suspense>
        </FederatedErrorBoundary>
    )
}

export interface DetailPanelsProps extends Omit<PanelRendererProps, 'panel'> {
    panels: DetailPanel[] | null | undefined
    /** Permission check for `panel.permission` (default: everything visible). */
    can?: (permission: string) => boolean
    /** i18n for panel titles (raw keys pass through by default). */
    translate?: (key: string) => string
    className?: string
}

/**
 * Detail panels of a record in a 2-column grid (`span: half` takes one
 * column, `full` both). Each panel is lazy and isolated: one failing panel
 * never blanks the detail page.
 */
export function DetailPanels({ panels, can, translate, className, ...rest }: DetailPanelsProps) {
    const visible = (panels ?? []).filter((p) => !p.permission || !can || can(p.permission))
    if (visible.length === 0) return null
    const tr = translate ?? ((k: string) => k)
    return (
        <div className={['grid grid-cols-1 gap-4 lg:grid-cols-2', className].filter(Boolean).join(' ')}>
            {visible.map((panel) => {
                const Renderer = lazyPanel(panel.kind)
                return (
                    <section
                        key={panel.key}
                        data-panel={panel.key}
                        aria-label={tr(panel.title)}
                        className={[
                            'min-w-0 rounded-lg border bg-card p-4',
                            panel.span === 'half' ? '' : 'lg:col-span-2',
                        ].join(' ')}
                    >
                        <h3 className="mb-3 text-sm font-medium text-foreground">{tr(panel.title)}</h3>
                        {Renderer ? (
                            <FederatedErrorBoundary addonKey={`panel:${panel.key}`} resetKeys={[rest.record]}>
                                <React.Suspense fallback={<ViewSkeleton height={200} />}>
                                    <Renderer {...rest} panel={panel} />
                                </React.Suspense>
                            </FederatedErrorBoundary>
                        ) : (
                            <p className="text-xs text-muted-foreground" data-testid="panel-unsupported">
                                {panel.kind}
                            </p>
                        )}
                    </section>
                )
            })}
        </div>
    )
}
