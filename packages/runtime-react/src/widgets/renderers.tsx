// Built-in dashboard widget renderers, one per declarative `kind`. Each takes
// the resolved spec + computed WidgetData + the format context (locale/currency)
// and renders the body INSIDE a <WidgetCard>. The recharts-backed kinds
// (bar/line/area/pie/donut) live in ./charts so this module — and the package
// index that re-exports it — never pulls recharts into the first paint.

import * as React from 'react'
import { cn } from '@asteby/metacore-ui/lib'
import type { DashboardWidgetSpec, WidgetData } from '../dashboard-types'
import { WidgetCard, DeltaChip, WidgetEmpty } from './widget-card'
import {
    accentClasses,
    paletteColor,
    formatWidgetValue,
    formatAxisTick,
    formatDelta,
    CHART_GRID,
    CHART_MUTED,
    type WidgetFormatCtx,
} from './widget-format'

export interface WidgetRenderProps {
    spec: DashboardWidgetSpec
    data?: WidgetData
    locale?: string
    currency?: string
    /** i18n: per-widget empty fallback (already translated). */
    emptyText: string
}

export const fmtCtx = (
    spec: DashboardWidgetSpec,
    locale?: string,
    currency?: string,
): WidgetFormatCtx => ({ format: spec.format, locale, currency })

export const hasSeries = (d?: WidgetData): d is WidgetData & { series: NonNullable<WidgetData['series']> } =>
    Array.isArray(d?.series) && d!.series!.length > 0

// --- stat -----------------------------------------------------------------
export function StatWidget(p: WidgetRenderProps) {
    const ctx = fmtCtx(p.spec, p.locale, p.currency)
    const value = p.data?.value
    const delta = p.data?.delta
    const hasValue = typeof value === 'number' && !Number.isNaN(value)
    return (
        <WidgetCard
            data-testid={`widget-${p.spec.key}`}
            title={p.spec.title}
            subtitle={p.spec.subtitle}
            icon={p.spec.icon}
            accent={p.spec.accent}
            headerExtra={
                typeof delta === 'number' ? (
                    <DeltaChip delta={delta} text={formatDelta(delta, p.locale)} />
                ) : undefined
            }
        >
            {hasValue ? (
                <div className="flex min-h-[2.5rem] items-end">
                    <div className="text-[2rem] font-semibold leading-none tabular-nums tracking-tight text-foreground">
                        {formatWidgetValue(value!, ctx)}
                    </div>
                </div>
            ) : (
                <div className="flex min-h-[2.5rem] items-center text-sm text-muted-foreground">
                    {p.emptyText}
                </div>
            )}
        </WidgetCard>
    )
}
// --- list (top-N with proportion bars) ------------------------------------
export function ListWidget(p: WidgetRenderProps) {
    const ctx = fmtCtx(p.spec, p.locale, p.currency)
    const a = accentClasses(p.spec.accent)
    const series = p.data?.series ?? []
    const max = series.reduce((m, s) => Math.max(m, s.value), 0) || 1
    return (
        <WidgetCard
            data-testid={`widget-${p.spec.key}`}
            title={p.spec.title}
            subtitle={p.spec.subtitle}
            icon={p.spec.icon}
            accent={p.spec.accent}
        >
            {series.length > 0 ? (
                <ul className="flex flex-col gap-2.5">
                    {series.map((pt) => (
                        <li key={pt.key} className="flex flex-col gap-1">
                            <div className="flex items-baseline justify-between gap-2 text-xs">
                                <span className="truncate text-foreground">{pt.label}</span>
                                <span className="shrink-0 font-medium tabular-nums text-muted-foreground">
                                    {formatWidgetValue(pt.value, ctx)}
                                </span>
                            </div>
                            <div className={cn('h-1.5 w-full overflow-hidden rounded-full', a.track)}>
                                <div
                                    className={cn('h-full rounded-full transition-all', a.bar)}
                                    style={{ width: `${Math.max(2, (pt.value / max) * 100)}%` }}
                                />
                            </div>
                        </li>
                    ))}
                </ul>
            ) : (
                <WidgetEmpty message={p.emptyText} />
            )}
        </WidgetCard>
    )
}

// --- progress -------------------------------------------------------------
// A scalar rendered as a proportion bar. When `format:'percent'` the value is
// a fraction in [0,1]; otherwise it's shown as the big number with a full bar.
export function ProgressWidget(p: WidgetRenderProps) {
    const ctx = fmtCtx(p.spec, p.locale, p.currency)
    const a = accentClasses(p.spec.accent)
    const value = p.data?.value
    const hasValue = typeof value === 'number' && !Number.isNaN(value)
    const pct =
        p.spec.format === 'percent'
            ? Math.min(100, Math.max(0, (value ?? 0) * 100))
            : 100
    return (
        <WidgetCard
            data-testid={`widget-${p.spec.key}`}
            title={p.spec.title}
            subtitle={p.spec.subtitle}
            icon={p.spec.icon}
            accent={p.spec.accent}
        >
            {hasValue ? (
                <div className="flex flex-col gap-2">
                    <div className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                        {formatWidgetValue(value!, ctx)}
                    </div>
                    <div className={cn('h-2 w-full overflow-hidden rounded-full', a.track)}>
                        <div
                            className={cn('h-full rounded-full transition-all duration-500', a.bar)}
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                </div>
            ) : (
                <WidgetEmpty message={p.emptyText} />
            )}
        </WidgetCard>
    )
}
