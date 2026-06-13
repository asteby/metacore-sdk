// Built-in dashboard widget renderers, one per declarative `kind`. Each takes
// the resolved spec + computed WidgetData + the format context (locale/currency)
// and renders the body INSIDE a <WidgetCard>. recharts powers the charts; colors
// come from theme CSS vars (dark-mode safe), curves are smooth, axes/legends
// compact, tooltips on.

import * as React from 'react'
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'
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

const fmtCtx = (
    spec: DashboardWidgetSpec,
    locale?: string,
    currency?: string,
): WidgetFormatCtx => ({ format: spec.format, locale, currency })

const hasSeries = (d?: WidgetData): d is WidgetData & { series: NonNullable<WidgetData['series']> } =>
    Array.isArray(d?.series) && d!.series!.length > 0

// Chart body that fills the card's flexible height. The dashboard grid gives
// each chart cell a definite height (fixed auto-rows × row-span), so height:100%
// resolves cleanly and charts scale with the card instead of a fixed stub.
function ChartArea({ children }: { children: React.ReactElement }) {
    return (
        <div className="min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
                {children}
            </ResponsiveContainer>
        </div>
    )
}

// Compact recharts tooltip styled with theme tokens.
function ChartTooltip({ ctx }: { ctx: WidgetFormatCtx }) {
    return (
        <Tooltip
            cursor={{ fill: 'var(--muted, rgba(148,163,184,0.12))', opacity: 0.4 }}
            contentStyle={{
                background: 'var(--popover, #fff)',
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--popover-foreground, #0f172a)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            }}
            labelStyle={{ color: 'var(--muted-foreground, #64748b)', marginBottom: 2 }}
            formatter={(v: number) => formatWidgetValue(Number(v), ctx)}
        />
    )
}

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
                <div className="flex min-h-0 flex-1 flex-col justify-center">
                    <div className="text-[2rem] font-semibold leading-none tabular-nums tracking-tight text-foreground">
                        {formatWidgetValue(value!, ctx)}
                    </div>
                </div>
            ) : (
                <WidgetEmpty message={p.emptyText} />
            )}
        </WidgetCard>
    )
}

// --- bar ------------------------------------------------------------------
export function BarWidget(p: WidgetRenderProps) {
    const ctx = fmtCtx(p.spec, p.locale, p.currency)
    const a = accentClasses(p.spec.accent)
    return (
        <WidgetCard
            data-testid={`widget-${p.spec.key}`}
            title={p.spec.title}
            subtitle={p.spec.subtitle}
            icon={p.spec.icon}
            accent={p.spec.accent}
        >
            {hasSeries(p.data) ? (
                <ChartArea>
                    <BarChart data={p.data.series} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke={CHART_GRID} strokeDasharray="3 3" />
                        <XAxis
                            dataKey="label"
                            tick={{ fontSize: 10, fill: CHART_MUTED }}
                            tickLine={false}
                            axisLine={false}
                            interval="preserveStartEnd"
                        />
                        <YAxis
                            tick={{ fontSize: 10, fill: CHART_MUTED }}
                            tickLine={false}
                            axisLine={false}
                            width={44}
                            tickFormatter={(v: number) => formatAxisTick(v, ctx)}
                        />
                        <ChartTooltip ctx={ctx} />
                        <Bar dataKey="value" fill={a.chartVar} radius={[4, 4, 0, 0]} maxBarSize={48} />
                    </BarChart>
                </ChartArea>
            ) : (
                <WidgetEmpty message={p.emptyText} />
            )}
        </WidgetCard>
    )
}

// --- line / area (shared) -------------------------------------------------
function TimeSeriesWidget(p: WidgetRenderProps & { variant: 'line' | 'area' }) {
    const ctx = fmtCtx(p.spec, p.locale, p.currency)
    const a = accentClasses(p.spec.accent)
    const gradId = `wg-grad-${p.spec.key}`
    return (
        <WidgetCard
            data-testid={`widget-${p.spec.key}`}
            title={p.spec.title}
            subtitle={p.spec.subtitle}
            icon={p.spec.icon}
            accent={p.spec.accent}
        >
            {hasSeries(p.data) ? (
                <ChartArea>
                    {p.variant === 'area' ? (
                        <AreaChart data={p.data.series} margin={{ top: 4, right: 6, left: -16, bottom: 0 }}>
                            <defs>
                                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={a.chartVar} stopOpacity={0.35} />
                                    <stop offset="100%" stopColor={a.chartVar} stopOpacity={0.02} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid vertical={false} stroke={CHART_GRID} strokeDasharray="3 3" />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: CHART_MUTED }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                            <YAxis tick={{ fontSize: 10, fill: CHART_MUTED }} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => formatAxisTick(v, ctx)} />
                            <ChartTooltip ctx={ctx} />
                            <Area type="monotone" dataKey="value" stroke={a.chartVar} strokeWidth={2} fill={`url(#${gradId})`} />
                        </AreaChart>
                    ) : (
                        <LineChart data={p.data.series} margin={{ top: 4, right: 6, left: -16, bottom: 0 }}>
                            <CartesianGrid vertical={false} stroke={CHART_GRID} strokeDasharray="3 3" />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: CHART_MUTED }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                            <YAxis tick={{ fontSize: 10, fill: CHART_MUTED }} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => formatAxisTick(v, ctx)} />
                            <ChartTooltip ctx={ctx} />
                            <Line type="monotone" dataKey="value" stroke={a.chartVar} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                        </LineChart>
                    )}
                </ChartArea>
            ) : (
                <WidgetEmpty message={p.emptyText} />
            )}
        </WidgetCard>
    )
}

export function LineWidget(p: WidgetRenderProps) {
    return <TimeSeriesWidget {...p} variant="line" />
}
export function AreaWidget(p: WidgetRenderProps) {
    return <TimeSeriesWidget {...p} variant="area" />
}

// --- pie / donut (shared) -------------------------------------------------
function CircularWidget(p: WidgetRenderProps & { variant: 'pie' | 'donut' }) {
    const ctx = fmtCtx(p.spec, p.locale, p.currency)
    return (
        <WidgetCard
            data-testid={`widget-${p.spec.key}`}
            title={p.spec.title}
            subtitle={p.spec.subtitle}
            icon={p.spec.icon}
            accent={p.spec.accent}
        >
            {hasSeries(p.data) ? (
                <div className="flex min-h-0 flex-1 items-center gap-3">
                    <div className="h-full min-h-0 w-[46%] shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <ChartTooltip ctx={ctx} />
                                <Pie
                                    data={p.data.series}
                                    dataKey="value"
                                    nameKey="label"
                                    innerRadius={p.variant === 'donut' ? '55%' : 0}
                                    outerRadius="92%"
                                    paddingAngle={p.variant === 'donut' ? 2 : 0}
                                    stroke="var(--background, #fff)"
                                    strokeWidth={2}
                                >
                                    {p.data.series.map((_, i) => (
                                        <Cell key={i} fill={paletteColor(i)} />
                                    ))}
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
                        {p.data.series.slice(0, 6).map((pt, i) => (
                            <li key={pt.key} className="flex items-center gap-2 text-xs">
                                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: paletteColor(i) }} />
                                <span className="truncate text-muted-foreground">{pt.label}</span>
                                <span className="ml-auto shrink-0 font-medium tabular-nums text-foreground">
                                    {formatWidgetValue(pt.value, ctx)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : (
                <WidgetEmpty message={p.emptyText} />
            )}
        </WidgetCard>
    )
}

export function PieWidget(p: WidgetRenderProps) {
    return <CircularWidget {...p} variant="pie" />
}
export function DonutWidget(p: WidgetRenderProps) {
    return <CircularWidget {...p} variant="donut" />
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
