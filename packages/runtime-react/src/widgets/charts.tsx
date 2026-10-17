// recharts-backed dashboard widgets (bar, line, area, pie, donut). Kept out of
// the package index on purpose: recharts is ~100 KB gzip and must not ride in
// the host's first paint. `WidgetRenderer` loads this module with React.lazy;
// hosts that want the components directly import
// `@asteby/metacore-runtime-react/charts`. Colors come from theme CSS vars
// (dark-mode safe), curves are smooth, axes/legends compact, tooltips on.

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
import { WidgetCard, WidgetEmpty } from './widget-card'
import {
    accentClasses,
    paletteColor,
    formatWidgetValue,
    formatAxisTick,
    CHART_GRID,
    CHART_MUTED,
    type WidgetFormatCtx,
} from './widget-format'
import { fmtCtx, hasSeries, type WidgetRenderProps } from './renderers'

export type { WidgetRenderProps }

// Fixed-height chart body. In the masonry (CSS columns) layout cards take their
// natural height, so charts need a definite height for ResponsiveContainer to
// resolve. This height + the card chrome gives every chart card a consistent,
// taller footprint that balances cleanly against compact stat cards.
const CHART_H = 'h-[190px]'
function ChartArea({ children }: { children: React.ReactElement }) {
    return (
        <div className={cn(CHART_H, 'w-full')}>
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
            formatter={(v) => formatWidgetValue(Number(v), ctx)}
        />
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
                <div className={cn(CHART_H, 'flex items-center gap-3')}>
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
