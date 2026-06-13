// Per-widget dispatcher: maps a spec.kind to its built-in renderer (or a
// federated <Slot> for kind:"custom"), wrapped in an error boundary so a single
// broken widget renders its own error card instead of tumbling the grid.

import * as React from 'react'
import { Slot } from '../slot'
import type { DashboardWidgetSpec, WidgetData, WidgetSize } from '../dashboard-types'
import { WidgetCard, WidgetError } from './widget-card'
import {
    StatWidget,
    BarWidget,
    LineWidget,
    AreaWidget,
    PieWidget,
    DonutWidget,
    ListWidget,
    ProgressWidget,
    type WidgetRenderProps,
} from './renderers'

/** Maps a widget size to its column span in the 4-col grid. */
export const SIZE_SPAN: Record<WidgetSize, number> = {
    sm: 1,
    md: 2,
    lg: 3,
    full: 4,
}

/** Tailwind col-span class per size (static → scanned in this package build). */
export const SIZE_CLASS: Record<WidgetSize, string> = {
    sm: 'sm:col-span-2 lg:col-span-1',
    md: 'sm:col-span-2 lg:col-span-2',
    lg: 'sm:col-span-2 lg:col-span-3',
    full: 'sm:col-span-2 lg:col-span-4',
}

const RENDERERS: Record<
    string,
    (p: WidgetRenderProps) => React.ReactElement
> = {
    stat: StatWidget,
    bar: BarWidget,
    line: LineWidget,
    area: AreaWidget,
    pie: PieWidget,
    donut: DonutWidget,
    list: ListWidget,
    progress: ProgressWidget,
}

interface BoundaryProps {
    spec: DashboardWidgetSpec
    message: string
    children: React.ReactNode
}
interface BoundaryState {
    error: boolean
}

/** Isolated boundary: a throwing widget renders its own error card. */
class WidgetErrorBoundary extends React.Component<BoundaryProps, BoundaryState> {
    state: BoundaryState = { error: false }
    static getDerivedStateFromError(): BoundaryState {
        return { error: true }
    }
    render() {
        if (this.state.error) {
            return (
                <WidgetCard
                    data-testid={`widget-${this.props.spec.key}`}
                    title={this.props.spec.title}
                    subtitle={this.props.spec.subtitle}
                    icon={this.props.spec.icon}
                    accent={this.props.spec.accent}
                >
                    <WidgetError message={this.props.message} />
                </WidgetCard>
            )
        }
        return this.props.children
    }
}

export interface WidgetRendererProps {
    spec: DashboardWidgetSpec
    data?: WidgetData
    locale?: string
    currency?: string
    /** Translated empty fallback for this widget. */
    emptyText: string
    /** Translated error message for this widget. */
    errorText: string
}

/**
 * Renders one widget. `kind:"custom"` defers to the federated slot
 * (`spec.slot ?? 'dashboard.widgets'`) inside the same card chrome so it
 * combines with the declarative widgets.
 */
export function WidgetRenderer({
    spec,
    data,
    locale,
    currency,
    emptyText,
    errorText,
}: WidgetRendererProps) {
    let body: React.ReactNode
    if (spec.kind === 'custom') {
        body = (
            <WidgetCard
                data-testid={`widget-${spec.key}`}
                title={spec.title}
                subtitle={spec.subtitle}
                icon={spec.icon}
                accent={spec.accent}
            >
                <Slot
                    name={spec.slot ?? 'dashboard.widgets'}
                    props={{ spec, data, locale, currency }}
                    fallback={
                        <div className="flex flex-1 items-center justify-center py-6 text-xs text-muted-foreground">
                            {emptyText}
                        </div>
                    }
                />
            </WidgetCard>
        )
    } else {
        const Renderer = RENDERERS[spec.kind]
        body = Renderer ? (
            <Renderer
                spec={spec}
                data={data}
                locale={locale}
                currency={currency}
                emptyText={emptyText}
            />
        ) : (
            <WidgetCard
                data-testid={`widget-${spec.key}`}
                title={spec.title}
                subtitle={spec.subtitle}
                icon={spec.icon}
                accent={spec.accent}
            >
                <WidgetError message={errorText} />
            </WidgetCard>
        )
    }

    return (
        <WidgetErrorBoundary spec={spec} message={errorText}>
            {body}
        </WidgetErrorBoundary>
    )
}

/** Skeleton placeholder shown per widget while data loads. */
export function WidgetSkeleton({ spec }: { spec: DashboardWidgetSpec }) {
    const isChart =
        spec.kind !== 'stat' && spec.kind !== 'progress' && spec.kind !== 'custom'
    return (
        <WidgetCard
            data-testid={`widget-skeleton-${spec.key}`}
            title={spec.title}
            subtitle={spec.subtitle}
            icon={spec.icon}
            accent={spec.accent}
        >
            {isChart ? (
                <div className="h-[132px] w-full animate-pulse rounded-md bg-muted" />
            ) : (
                <div className="flex flex-col gap-2">
                    <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
                    <div className="h-2 w-full animate-pulse rounded bg-muted/60" />
                </div>
            )}
        </WidgetCard>
    )
}
