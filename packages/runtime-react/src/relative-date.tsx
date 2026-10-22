// "hace X" cell (`display: "relative_date"`) and the pure helpers behind it.
//
//   display_config: { fresh_within: "15m", stale_after: "1h", tooltip: "absolute" }
//
// Without thresholds the text is neutral. With them a coloured dot precedes the
// text: green (age <= fresh_within), amber (between) and red (age >= stale_after).
// The cell re-renders every 60 s without refetching.
import * as React from 'react'
import { formatDistanceToNow, type Locale } from 'date-fns'

export type FreshnessTone = 'fresh' | 'warn' | 'stale'

const UNIT_MS: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
}

/** Parses `30s|15m|6h|7d` (or a bare number of ms). Returns undefined if invalid. */
export function parseDurationMs(input: unknown): number | undefined {
    if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? input : undefined
    if (typeof input !== 'string') return undefined
    const m = /^\s*(\d+(?:\.\d+)?)\s*([smhd])\s*$/i.exec(input)
    if (!m) return undefined
    return Number(m[1]) * UNIT_MS[m[2].toLowerCase()]
}

/**
 * Tone for an age. Undefined when neither threshold is configured (neutral).
 * With only `fresh_within`: fresh or stale. With only `stale_after`: warn/stale.
 */
export function freshnessTone(
    ageMs: number,
    freshWithin?: number,
    staleAfter?: number,
): FreshnessTone | undefined {
    if (freshWithin === undefined && staleAfter === undefined) return undefined
    if (staleAfter !== undefined && ageMs >= staleAfter) return 'stale'
    if (freshWithin !== undefined) return ageMs <= freshWithin ? 'fresh' : staleAfter !== undefined ? 'warn' : 'stale'
    return 'warn'
}

const TONE_CLASS: Record<FreshnessTone, string> = {
    fresh: 'bg-emerald-500',
    warn: 'bg-amber-500',
    stale: 'bg-red-500',
}

export const RelativeDateCell: React.FC<{
    value: unknown
    locale: Locale
    config?: { fresh_within?: unknown; stale_after?: unknown; tooltip?: unknown }
    /** Absolute representation used for the tooltip (org time zone). */
    absolute?: string
    /** Test seam. */
    now?: () => number
}> = ({ value, locale, config, absolute, now = Date.now }) => {
    const [, tick] = React.useReducer((n: number) => n + 1, 0)
    React.useEffect(() => {
        const id = setInterval(tick, 60_000)
        return () => clearInterval(id)
    }, [])

    if (value === null || value === undefined || value === '') {
        return <span className="text-muted-foreground">-</span>
    }
    const date = new Date(value as any)
    if (isNaN(date.getTime()) || date.getFullYear() <= 1) {
        return <span className="text-muted-foreground">-</span>
    }
    const nowMs = now()
    const age = Math.max(0, nowMs - date.getTime())
    const tone = freshnessTone(
        age,
        parseDurationMs(config?.fresh_within),
        parseDurationMs(config?.stale_after),
    )
    const text = formatDistanceToNow(date, { addSuffix: true, locale })
    const title = config?.tooltip === 'none' ? undefined : absolute
    return (
        <div className="flex items-center gap-1.5 text-muted-foreground" title={title}>
            {tone && (
                <span
                    data-tone={tone}
                    aria-hidden="true"
                    className={`h-2 w-2 shrink-0 rounded-full ${TONE_CLASS[tone]}`}
                />
            )}
            <span className="text-sm font-medium">{text}</span>
        </div>
    )
}

// ---- brand colour helpers (avatar fallback) ----

/** Parses #rgb / #rrggbb. Returns [r,g,b] or undefined. */
export function parseHexColor(input: unknown): [number, number, number] | undefined {
    if (typeof input !== 'string') return undefined
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim())
    if (!m) return undefined
    let h = m[1]
    if (h.length === 3) h = h.split('').map((c) => c + c).join('')
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function luminance([r, g, b]: [number, number, number]): number {
    const f = (v: number) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
    const la = luminance(a)
    const lb = luminance(b)
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const INK_LIGHT: [number, number, number] = [255, 255, 255]
const INK_DARK: [number, number, number] = [2, 6, 23]

/**
 * Background + ink for initials over a brand colour. Picks whichever ink has
 * the higher contrast (always >= 4.5:1 for light/dark pair against any colour
 * short of mid-greys, where it still returns the best available).
 */
export function brandAvatarColors(
    hex: unknown,
): { background: string; color: string; ratio: number } | undefined {
    const rgb = parseHexColor(hex)
    if (!rgb) return undefined
    const light = contrastRatio(rgb, INK_LIGHT)
    const dark = contrastRatio(rgb, INK_DARK)
    const useLight = light >= dark
    return {
        background: `rgb(${rgb.join(',')})`,
        color: useLight ? '#ffffff' : '#020617',
        ratio: useLight ? light : dark,
    }
}
