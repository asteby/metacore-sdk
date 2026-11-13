// Rich table cells — presentational primitives for the declarative column renderers `chips`, the multi-swatch `color`
// and `meter`. Pure and host-agnostic: the factory in dynamic-columns.tsx reads the manifest's `display_config`
// and the row, and hands plain props here.
//
//   chips   a list (JSON array or CSV) as colored badges. `display_config`: labels {value→text or i18n key},
//           colors {value→color name}, icons {value→lucide slug}, max (default 3, the rest folds into «+N»).
//           Same pill as the select/status badges (OptionBadge), so an unconfigured value still gets a stable color.
//   color   (existing cell) `display_config.also: [<column>…]` paints the sibling columns' colors next to the first one
//           (brand primary + accent in one cell) instead of one column per color.
//   meter   a number and, when `display_config.max` / `max_field` gives a ceiling, a bar showing how full it is
//           (a wallet balance against what was topped up, a quota). Without a ceiling it is just the formatted number.
import * as React from 'react'
import { Progress } from './dialogs/_primitives'
import { OptionBadge } from './display-value'

export interface ChipItem {
    value: string
    label?: string
    color?: string
    icon?: string
}

/** Normalizes a JSON array (strings or {value,label,color,icon} objects) or a CSV string into chip items. */
export function chipItems(value: unknown): ChipItem[] {
    const out: ChipItem[] = []
    const push = (it: ChipItem) => {
        if (it.value) out.push(it)
    }
    if (Array.isArray(value)) {
        for (const v of value) {
            if (v && typeof v === 'object') {
                const o = v as Record<string, unknown>
                const val = String(o.value ?? o.key ?? o.name ?? o.label ?? '')
                push({
                    value: val,
                    label: o.label != null ? String(o.label) : o.name != null ? String(o.name) : undefined,
                    color: typeof o.color === 'string' ? o.color : undefined,
                    icon: typeof o.icon === 'string' ? o.icon : undefined,
                })
            } else if (v !== null && v !== undefined) {
                push({ value: String(v) })
            }
        }
    } else if (typeof value === 'string' && value.trim() !== '') {
        for (const s of value.split(',')) push({ value: s.trim() })
    }
    return out
}

export interface ChipsCellProps {
    value: unknown
    labels?: Record<string, string>
    colors?: Record<string, string>
    icons?: Record<string, string>
    /** Visible chips before folding the rest into «+N». Default 3. */
    max?: number
    /** i18n lookup for `labels` values (they may be keys). Falls back to the raw text. */
    t?: (key: string, opts?: { defaultValue?: string }) => string
    getImageUrl?: (path: string) => string
}

export const ChipsCell: React.FC<ChipsCellProps> = ({ value, labels, colors, icons, max = 3, t, getImageUrl }) => {
    const items = chipItems(value)
    if (items.length === 0) return <span className="text-muted-foreground">-</span>
    const limit = Number.isFinite(max) && max >= 1 ? Math.floor(max) : 3
    const text = (it: ChipItem): string => {
        const raw = labels?.[it.value] ?? it.label ?? it.value
        return t ? t(raw, { defaultValue: raw }) : raw
    }
    const shown = items.slice(0, limit)
    const rest = items.slice(limit)
    return (
        <div className="flex flex-wrap items-center gap-1">
            {shown.map((it, i) => (
                <OptionBadge
                    key={`${it.value}-${i}`}
                    option={{
                        value: it.value,
                        label: text(it),
                        color: it.color ?? colors?.[it.value],
                        icon: it.icon ?? icons?.[it.value],
                    }}
                    getImageUrl={getImageUrl}
                />
            ))}
            {rest.length > 0 && (
                <span
                    className="rounded-full bg-muted px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
                    title={rest.map(text).join(', ')}
                    data-chips-overflow
                >
                    +{rest.length}
                </span>
            )}
        </div>
    )
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

/** Keeps only values that are safe to paint as a CSS color (hex): a manifest-driven cell never injects arbitrary CSS. */
export const validSwatches = (colors: unknown[]): string[] =>
    colors.filter((c): c is string => typeof c === 'string' && HEX.test(c.trim())).map((c) => c.trim())

export const SwatchCell: React.FC<{ colors: string[] }> = ({ colors }) => {
    const list = validSwatches(colors)
    if (list.length === 0) return <span className="text-muted-foreground">-</span>
    return (
        <div className="flex items-center gap-2" title={list.join(' · ')}>
            <span className="flex items-center">
                {list.map((hex, i) => (
                    <span
                        key={`${hex}-${i}`}
                        data-swatch
                        className="h-4 w-4 shrink-0 rounded border border-border/60"
                        style={{ background: hex, marginLeft: i === 0 ? 0 : -4 }}
                    />
                ))}
            </span>
            <code className="font-mono text-xs text-muted-foreground">{list[0]}</code>
        </div>
    )
}

export interface MeterCellProps {
    value: unknown
    /** Ceiling of the bar; when absent or not > 0 the cell shows only the number. */
    max?: unknown
    unit?: string
    locale?: string
}

const toNumber = (v: unknown): number | null => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v)
        return Number.isFinite(n) ? n : null
    }
    return null
}

export const MeterCell: React.FC<MeterCellProps> = ({ value, max, unit, locale }) => {
    const num = toNumber(value)
    if (num === null) return <span className="text-muted-foreground">-</span>
    const label = new Intl.NumberFormat(locale || undefined).format(num) + (unit ? ` ${unit}` : '')
    const ceiling = toNumber(max)
    if (ceiling === null || ceiling <= 0) return <span className="tabular-nums">{label}</span>
    const pct = Math.max(0, Math.min(100, (num / ceiling) * 100))
    return (
        <div className="flex min-w-[140px] items-center gap-2">
            <Progress value={pct} className="flex-1" />
            <span className="whitespace-nowrap text-xs font-medium tabular-nums text-muted-foreground">{label}</span>
        </div>
    )
}
