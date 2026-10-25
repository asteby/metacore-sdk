// recharts-backed dashboard widgets (bar, line, area, pie, donut). Kept out of
// the package index on purpose: recharts is ~100 KB gzip and must not ride in
// the host's first paint. `WidgetRenderer` loads this module with React.lazy;
// hosts that want the components directly import
// `@asteby/metacore-runtime-react/charts`. The chart bodies live in
// `@asteby/metacore-charts/recharts`; this file only adds the WidgetCard chrome.

import * as React from 'react'
import {
    AreaChartBody,
    BarChartBody,
    DonutChartBody,
    LineChartBody,
    PieChartBody,
    type ChartBodyProps,
} from '@asteby/metacore-charts/recharts'
import { WidgetCard, WidgetEmpty } from './widget-card'
import { hasSeries, type WidgetRenderProps } from './renderers'

export type { WidgetRenderProps }

function ChartWidget(p: WidgetRenderProps & { Body: React.ComponentType<ChartBodyProps> }) {
    const { Body } = p
    return (
        <WidgetCard
            data-testid={`widget-${p.spec.key}`}
            title={p.spec.title}
            subtitle={p.spec.subtitle}
            icon={p.spec.icon}
            accent={p.spec.accent}
        >
            {hasSeries(p.data) ? (
                <Body
                    series={p.data.series}
                    accent={p.spec.accent}
                    format={p.spec.format}
                    locale={p.locale}
                    currency={p.currency}
                    id={p.spec.key}
                />
            ) : (
                <WidgetEmpty message={p.emptyText} />
            )}
        </WidgetCard>
    )
}

export function BarWidget(p: WidgetRenderProps) {
    return <ChartWidget {...p} Body={BarChartBody} />
}
export function LineWidget(p: WidgetRenderProps) {
    return <ChartWidget {...p} Body={LineChartBody} />
}
export function AreaWidget(p: WidgetRenderProps) {
    return <ChartWidget {...p} Body={AreaChartBody} />
}
export function PieWidget(p: WidgetRenderProps) {
    return <ChartWidget {...p} Body={PieChartBody} />
}
export function DonutWidget(p: WidgetRenderProps) {
    return <ChartWidget {...p} Body={DonutChartBody} />
}
