// `view_type: chart` and `kind: chart` detail panels. Reuses the dashboard
// widgets (same WidgetQuery, same aggregation engine on the host, same cards):
// no new chart code, no client-side math. This module is a lazy chunk; it is
// the only place views reach recharts (through ../widgets/charts).
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import type { ChartView } from '@asteby/metacore-sdk'
import type { DashboardWidgetSpec, WidgetData, WidgetFormat } from '../dashboard-types'
import { AreaWidget, BarWidget, DonutWidget, LineWidget, PieWidget } from '../widgets/charts'
import type { WidgetRenderProps } from '../widgets/renderers'
import type { ChartRequest, PanelRendererProps, ViewDataSource, ViewRendererProps } from './types'
import { ViewSkeleton } from './skeleton'

const BY_KIND: Record<string, React.ComponentType<WidgetRenderProps>> = {
    bar: BarWidget,
    line: LineWidget,
    area: AreaWidget,
    pie: PieWidget,
    donut: DonutWidget,
}

/** Load one declared chart; exposes loading/error so tests and hosts can assert. */
export function useChartData(data: ViewDataSource, req: ChartRequest | null) {
    const [state, setState] = React.useState<{ loading: boolean; data?: WidgetData; error?: Error }>({
        loading: true,
    })
    const sig = req ? JSON.stringify(req) : ''
    React.useEffect(() => {
        if (!req) return
        let cancelled = false
        setState({ loading: true })
        data.chart(req).then(
            (d) => !cancelled && setState({ loading: false, data: d }),
            (e: unknown) => !cancelled && setState({ loading: false, error: e instanceof Error ? e : new Error(String(e)) }),
        )
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, sig])
    return state
}

function ChartBody({
    chart,
    title,
    req,
    data,
    locale,
    currency,
}: {
    chart: ChartView
    title: string
    req: ChartRequest
    data: ViewDataSource
    locale?: string
    currency?: string
}) {
    const { t } = useTranslation()
    const state = useChartData(data, req)
    const Widget = BY_KIND[chart.kind]
    if (state.loading) return <ViewSkeleton height={260} />
    if (state.error) {
        return (
            <p role="alert" className="text-sm text-destructive">
                {t('metacore.views.error', 'No se pudo cargar la información.')}
            </p>
        )
    }
    if (!Widget) return null
    const spec: DashboardWidgetSpec = {
        key: req.panelKey ?? `${req.model}.chart`,
        title: t(title),
        kind: chart.kind as DashboardWidgetSpec['kind'],
        format: chart.format as WidgetFormat | undefined,
    }
    return (
        <div data-testid="chart-view" data-kind={chart.kind}>
            <Widget
                spec={spec}
                data={state.data}
                locale={locale}
                currency={currency}
                emptyText={t('metacore.views.empty', 'Sin datos todavía.')}
            />
        </div>
    )
}

/** `view_type: chart` on a nav entry. */
export default function ChartViewRenderer(props: ViewRendererProps<'chart'>) {
    const { view, model, data, metadata, locale, currency, className } = props
    if (!view.query) return null
    const req: ChartRequest = { model, query: view.query }
    return (
        <div className={className}>
            <ChartBody
                chart={view}
                title={metadata?.title ?? model}
                req={req}
                data={data}
                locale={locale}
                currency={currency}
            />
        </div>
    )
}

/** `kind: chart` detail panel (query scoped to the record's relation). */
export function ChartPanel({ panel, model, record, data, locale, currency }: PanelRendererProps) {
    const chart = panel.chart
    const id = record.id
    if (!chart?.query || id === undefined || id === null) return null
    const req: ChartRequest = {
        model,
        query: chart.query,
        relation: chart.relation,
        recordId: String(id),
        panelKey: panel.key,
    }
    return <ChartBody chart={chart} title={panel.title} req={req} data={data} locale={locale} currency={currency} />
}
