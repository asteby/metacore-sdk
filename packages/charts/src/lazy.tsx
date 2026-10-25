// Lazy facades for the recharts bodies. The package index imports these
// instead of ./bodies, so recharts is its own async chunk: it downloads only
// when a chart actually renders.

import * as React from 'react'
import type { ChartBodyProps } from './bodies'
import { CHART_BODY_HEIGHT } from './constants'

const loadBodies = () => import('./bodies')

/** Warm the recharts chunk (e.g. on hover of a dashboard link). Idempotent. */
export function preloadCharts(): Promise<unknown> {
    return loadBodies()
}

const LazyBar = React.lazy(() => loadBodies().then((m) => ({ default: m.BarChartBody })))
const LazyLine = React.lazy(() => loadBodies().then((m) => ({ default: m.LineChartBody })))
const LazyArea = React.lazy(() => loadBodies().then((m) => ({ default: m.AreaChartBody })))
const LazyPie = React.lazy(() => loadBodies().then((m) => ({ default: m.PieChartBody })))
const LazyDonut = React.lazy(() => loadBodies().then((m) => ({ default: m.DonutChartBody })))

function Skeleton({ height = CHART_BODY_HEIGHT }: { height?: number }) {
    return (
        <div
            data-chart-skeleton=""
            aria-hidden="true"
            className="w-full animate-pulse rounded-md bg-muted"
            style={{ height }}
        />
    )
}

function withSuspense(Lazy: React.ComponentType<ChartBodyProps>) {
    return function LazyChart(p: ChartBodyProps) {
        return (
            <React.Suspense fallback={<Skeleton height={p.height} />}>
                <Lazy {...p} />
            </React.Suspense>
        )
    }
}

export const BarChart = withSuspense(LazyBar)
export const LineChart = withSuspense(LazyLine)
export const AreaChart = withSuspense(LazyArea)
export const PieChart = withSuspense(LazyPie)
export const DonutChart = withSuspense(LazyDonut)
