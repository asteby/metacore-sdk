// Shared widget formatting + accent theming. Reuses the same Intl-based
// approach as the table cells (dynamic-columns) so dashboard numbers read
// identically to the grids: org currency + locale, compact notation, percent.

import type { WidgetAccent, WidgetFormat } from '../dashboard-types'

export interface WidgetFormatCtx {
    format?: WidgetFormat
    locale?: string
    currency?: string
}

/**
 * Formats a scalar/series value with the widget's declared format. `currency`
 * uses the org currency + locale (same fallback chain as table cells); `percent`
 * treats the value as a fraction (0.142 → "14.2%"); `compact` uses Intl compact
 * notation (1_200 → "1.2K").
 */
export function formatWidgetValue(
    value: number,
    { format = 'number', locale, currency }: WidgetFormatCtx,
): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—'
    const loc = locale || undefined
    switch (format) {
        case 'currency':
            return new Intl.NumberFormat(loc, {
                style: 'currency',
                currency: currency || 'USD',
                maximumFractionDigits: 2,
            }).format(value)
        case 'percent':
            return new Intl.NumberFormat(loc, {
                style: 'percent',
                minimumFractionDigits: 0,
                maximumFractionDigits: 1,
            }).format(value)
        case 'compact':
            return new Intl.NumberFormat(loc, {
                notation: 'compact',
                maximumFractionDigits: 1,
            }).format(value)
        case 'number':
        default:
            return new Intl.NumberFormat(loc, {
                maximumFractionDigits: 2,
            }).format(value)
    }
}

/** Axis-tick formatter — always compact so charts stay legible. */
export function formatAxisTick(
    value: number,
    { format, locale, currency }: WidgetFormatCtx,
): string {
    const loc = locale || undefined
    if (format === 'currency') {
        return new Intl.NumberFormat(loc, {
            style: 'currency',
            currency: currency || 'USD',
            notation: 'compact',
            maximumFractionDigits: 1,
        }).format(value)
    }
    if (format === 'percent') {
        return new Intl.NumberFormat(loc, {
            style: 'percent',
            maximumFractionDigits: 0,
        }).format(value)
    }
    return new Intl.NumberFormat(loc, {
        notation: 'compact',
        maximumFractionDigits: 1,
    }).format(value)
}

/** Formats the compare delta fraction (0.142 → "+14.2%"). */
export function formatDelta(delta: number, locale?: string): string {
    const sign = delta > 0 ? '+' : ''
    return (
        sign +
        new Intl.NumberFormat(locale || undefined, {
            style: 'percent',
            minimumFractionDigits: 0,
            maximumFractionDigits: 1,
        }).format(delta)
    )
}

// --- Accent theming -------------------------------------------------------
// Tailwind tokens scanned in THIS package's build (the renderers live in the
// SDK, not the federated host), so static utility classes are safe. We avoid
// host-dependent arbitrary values. Each accent maps to a small bundle of
// classes for the icon chip, the chart stroke/fill and the progress/list bar.

export interface AccentClasses {
    /** Icon chip background + foreground. */
    chip: string
    /** Text color for accented labels. */
    text: string
    /** Solid bar/fill background (progress, list proportion). */
    bar: string
    /** Soft track background behind a bar. */
    track: string
    /** Hex-ish CSS color used for recharts stroke/fill (var-based). */
    chartVar: string
}

const ACCENTS: Record<WidgetAccent, AccentClasses> = {
    emerald: {
        chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        text: 'text-emerald-600 dark:text-emerald-400',
        bar: 'bg-emerald-500',
        track: 'bg-emerald-500/15',
        chartVar: 'var(--color-widget-emerald, #10b981)',
    },
    sky: {
        chip: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
        text: 'text-sky-600 dark:text-sky-400',
        bar: 'bg-sky-500',
        track: 'bg-sky-500/15',
        chartVar: 'var(--color-widget-sky, #0ea5e9)',
    },
    violet: {
        chip: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
        text: 'text-violet-600 dark:text-violet-400',
        bar: 'bg-violet-500',
        track: 'bg-violet-500/15',
        chartVar: 'var(--color-widget-violet, #8b5cf6)',
    },
    amber: {
        chip: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        text: 'text-amber-600 dark:text-amber-400',
        bar: 'bg-amber-500',
        track: 'bg-amber-500/15',
        chartVar: 'var(--color-widget-amber, #f59e0b)',
    },
    rose: {
        chip: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
        text: 'text-rose-600 dark:text-rose-400',
        bar: 'bg-rose-500',
        track: 'bg-rose-500/15',
        chartVar: 'var(--color-widget-rose, #f43f5e)',
    },
    slate: {
        chip: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
        text: 'text-slate-600 dark:text-slate-300',
        bar: 'bg-slate-500',
        track: 'bg-slate-500/15',
        chartVar: 'var(--color-widget-slate, #64748b)',
    },
}

const DEFAULT_ACCENT: WidgetAccent = 'sky'

/** Resolves the accent class bundle, defaulting to `sky`. */
export function accentClasses(accent?: WidgetAccent): AccentClasses {
    return ACCENTS[accent ?? DEFAULT_ACCENT] ?? ACCENTS[DEFAULT_ACCENT]
}

/**
 * A categorical palette for multi-series charts (pie/donut/bar by bucket).
 * Cycles the accent chart vars so slices stay theme-aware + dark-mode safe.
 */
export const CHART_PALETTE: string[] = [
    ACCENTS.sky.chartVar,
    ACCENTS.emerald.chartVar,
    ACCENTS.violet.chartVar,
    ACCENTS.amber.chartVar,
    ACCENTS.rose.chartVar,
    ACCENTS.slate.chartVar,
]

/** Picks a palette color by index, wrapping around. */
export function paletteColor(index: number): string {
    return CHART_PALETTE[index % CHART_PALETTE.length]
}

/** Grid/axis muted color from the theme (works in light + dark). */
export const CHART_MUTED = 'var(--muted-foreground, #94a3b8)'
export const CHART_GRID = 'var(--border, #e2e8f0)'
