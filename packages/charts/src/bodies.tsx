// recharts-backed chart bodies (bar, line, area, pie, donut) WITHOUT any card
// chrome: hosts wrap them in their own card (runtime-react wraps them in
// WidgetCard). Colors come from theme CSS vars (dark-mode safe), curves are
// smooth, axes/legends compact, tooltips on. This module statically imports
// recharts (~100 KB gzip) — reach it only through `./recharts` or the lazy
// facades in the package index.

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
import { CHART_BODY_HEIGHT } from './constants'
import {
    accentClasses,
    paletteColor,
    formatWidgetValue,
    formatAxisTick,
    CHART_GRID,
    CHART_MUTED,
    type WidgetAccent,
    type WidgetFormatCtx,
} from './format'

export interface ChartPoint {
    key: string
    label: string
    value: number
}

export interface ChartBodyProps {
    series: ReadonlyArray<ChartPoint>
    accent?: WidgetAccent
    format?: WidgetFormatCtx['format']
    locale?: string
    currency?: string
    /** Fixed body height in px (ResponsiveContainer needs a definite one). Default 190. */
    height?: number
    /** Used to namespace the area gradient id. */
    id?: string
}

export { CHART_BODY_HEIGHT }

const fmt = (p: ChartBodyProps): WidgetFormatCtx => ({ format: p.format, locale: p.locale, currency: p.currency })

function ChartArea({ height = CHART_BODY_HEIGHT, children }: { height?: number; children: React.ReactElement }) {
    return (
        <div style={{ height, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
                {children}
            </ResponsiveContainer>
        </div>
    )
}

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

const tick = { fontSize: 10, fill: CHART_MUTED }

export function BarChartBody(p: ChartBodyProps) {
    const ctx = fmt(p)
    const a = accentClasses(p.accent)
    return (
        <ChartArea height={p.height}>
            <BarChart data={p.series as ChartPoint[]} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={CHART_GRID} strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={tick} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => formatAxisTick(v, ctx)} />
                <ChartTooltip ctx={ctx} />
                <Bar dataKey="value" fill={a.chartVar} radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
        </ChartArea>
    )
}

export function LineChartBody(p: ChartBodyProps) {
    const ctx = fmt(p)
    const a = accentClasses(p.accent)
    return (
        <ChartArea height={p.height}>
            <LineChart data={p.series as ChartPoint[]} margin={{ top: 4, right: 6, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={CHART_GRID} strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={tick} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => formatAxisTick(v, ctx)} />
                <ChartTooltip ctx={ctx} />
                <Line type="monotone" dataKey="value" stroke={a.chartVar} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
        </ChartArea>
    )
}

export function AreaChartBody(p: ChartBodyProps) {
    const ctx = fmt(p)
    const a = accentClasses(p.accent)
    const gradId = `mc-grad-${p.id ?? 'area'}`
    return (
        <ChartArea height={p.height}>
            <AreaChart data={p.series as ChartPoint[]} margin={{ top: 4, right: 6, left: -16, bottom: 0 }}>
                <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={a.chartVar} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={a.chartVar} stopOpacity={0.02} />
                    </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={CHART_GRID} strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={tick} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => formatAxisTick(v, ctx)} />
                <ChartTooltip ctx={ctx} />
                <Area type="monotone" dataKey="value" stroke={a.chartVar} strokeWidth={2} fill={`url(#${gradId})`} />
            </AreaChart>
        </ChartArea>
    )
}

function CircularBody(p: ChartBodyProps & { variant: 'pie' | 'donut' }) {
    const ctx = fmt(p)
    const height = p.height ?? CHART_BODY_HEIGHT
    return (
        <div className="flex items-center gap-3" style={{ height }}>
            <div className="h-full min-h-0 w-[46%] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <ChartTooltip ctx={ctx} />
                        <Pie
                            data={p.series as ChartPoint[]}
                            dataKey="value"
                            nameKey="label"
                            innerRadius={p.variant === 'donut' ? '55%' : 0}
                            outerRadius="92%"
                            paddingAngle={p.variant === 'donut' ? 2 : 0}
                            stroke="var(--background, #fff)"
                            strokeWidth={2}
                        >
                            {p.series.map((_, i) => (
                                <Cell key={i} fill={paletteColor(i)} />
                            ))}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
            </div>
            <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
                {p.series.slice(0, 6).map((pt, i) => (
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
    )
}

export function PieChartBody(p: ChartBodyProps) {
    return <CircularBody {...p} variant="pie" />
}
export function DonutChartBody(p: ChartBodyProps) {
    return <CircularBody {...p} variant="donut" />
}
