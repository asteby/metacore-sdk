// Lazy facades for the recharts-backed widgets. The package index and
// WidgetRenderer import these instead of ./charts, so recharts becomes its own
// async chunk: it downloads only when a dashboard actually renders a
// bar/line/area/pie/donut widget. Public names stay the same as before.

import * as React from 'react'
import { WidgetCard } from './widget-card'
import type { WidgetRenderProps } from './renderers'

const loadCharts = () => import('./charts')

/** Warm the charts chunk (e.g. on hover of a dashboard link). Idempotent. */
export function preloadWidgetCharts(): Promise<unknown> {
    return loadCharts()
}

const LazyBar = React.lazy(() => loadCharts().then((m) => ({ default: m.BarWidget })))
const LazyLine = React.lazy(() => loadCharts().then((m) => ({ default: m.LineWidget })))
const LazyArea = React.lazy(() => loadCharts().then((m) => ({ default: m.AreaWidget })))
const LazyPie = React.lazy(() => loadCharts().then((m) => ({ default: m.PieWidget })))
const LazyDonut = React.lazy(() => loadCharts().then((m) => ({ default: m.DonutWidget })))

function ChartFallback(p: WidgetRenderProps) {
    return (
        <WidgetCard
            data-testid={`widget-skeleton-${p.spec.key}`}
            title={p.spec.title}
            subtitle={p.spec.subtitle}
            icon={p.spec.icon}
            accent={p.spec.accent}
        >
            <div className="h-[190px] w-full animate-pulse rounded-md bg-muted" />
        </WidgetCard>
    )
}

function withSuspense(Lazy: React.ComponentType<WidgetRenderProps>) {
    return function LazyChartWidget(p: WidgetRenderProps) {
        return (
            <React.Suspense fallback={<ChartFallback {...p} />}>
                <Lazy {...p} />
            </React.Suspense>
        )
    }
}

export const BarWidget = withSuspense(LazyBar)
export const LineWidget = withSuspense(LazyLine)
export const AreaWidget = withSuspense(LazyArea)
export const PieWidget = withSuspense(LazyPie)
export const DonutWidget = withSuspense(LazyDonut)
