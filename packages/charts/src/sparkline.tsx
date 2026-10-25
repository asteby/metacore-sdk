// Dependency-free sparkline: plain SVG, no recharts, no layout measuring.
// Imports only the palette module so it stays a few hundred bytes gzip.

import * as React from 'react'
import { accentClasses, type WidgetAccent } from './format'

export interface SparklineProps {
    /** Values, oldest first. Non-finite entries are skipped. */
    data: ReadonlyArray<number>
    width?: number
    height?: number
    /** Theme accent for the stroke (default `sky`). Ignored when `color` is set. */
    accent?: WidgetAccent
    /** Any CSS color / var(); overrides `accent`. */
    color?: string
    strokeWidth?: number
    /** Fill the area under the line with a soft tint. */
    area?: boolean
    /** Accessible name. Without it the sparkline is decorative (`aria-hidden`). */
    label?: string
    className?: string
}

export interface SparklineGeometry {
    /** `M x y L x y …` path of the line ('' when there are no points). */
    line: string
    /** Closed path under the line, for the area fill ('' when empty). */
    area: string
    points: Array<[number, number]>
}

/** Pure geometry so it can be tested without a DOM. */
export function sparklineGeometry(
    data: ReadonlyArray<number>,
    width: number,
    height: number,
    pad = 2,
): SparklineGeometry {
    const values = data.filter((v) => typeof v === 'number' && Number.isFinite(v))
    if (values.length === 0) return { line: '', area: '', points: [] }
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min
    const innerW = Math.max(0, width - pad * 2)
    const innerH = Math.max(0, height - pad * 2)
    const r = (n: number) => Math.round(n * 100) / 100
    const points = values.map((v, i): [number, number] => {
        const x = values.length === 1 ? width / 2 : pad + (innerW * i) / (values.length - 1)
        // flat series sits in the middle instead of on the baseline
        const y = span === 0 ? height / 2 : pad + innerH * (1 - (v - min) / span)
        return [r(x), r(y)]
    })
    const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')
    const first = points[0]!
    const last = points[points.length - 1]!
    const area = `${line} L${last[0]} ${height - pad} L${first[0]} ${height - pad} Z`
    return { line, area, points }
}

export function Sparkline({
    data,
    width = 96,
    height = 28,
    accent,
    color,
    strokeWidth = 1.5,
    area = false,
    label,
    className,
}: SparklineProps) {
    const stroke = color ?? accentClasses(accent).chartVar
    const geo = sparklineGeometry(data, width, height)
    const a11y = label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true as const }
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox={`0 0 ${width} ${height}`}
            width={width}
            height={height}
            className={className}
            data-sparkline=""
            {...a11y}
        >
            {geo.points.length > 0 && area && <path d={geo.area} fill={stroke} fillOpacity={0.15} stroke="none" />}
            {geo.points.length > 1 && (
                <path
                    d={geo.line}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            )}
            {geo.points.length === 1 && <circle cx={geo.points[0]![0]} cy={geo.points[0]![1]} r={strokeWidth + 0.5} fill={stroke} />}
        </svg>
    )
}
