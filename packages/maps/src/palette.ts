// Colour is never the only channel (the list prints the status and DOM markers
// carry a glyph); these hues are the Okabe–Ito set, distinguishable under the
// common colour-vision deficiencies. Hosts can override per point.
export const PALETTE = [
    '#0072B2',
    '#D55E00',
    '#009E73',
    '#CC79A7',
    '#E69F00',
    '#56B4E9',
    '#F0E442',
    '#6B7280',
] as const

export const DEFAULT_COLOR = PALETTE[0]

/** Stable colour of a status/option key (same key → same colour on every render). */
export function colorFor(key: string | undefined, overrides?: Record<string, string>): string {
    if (!key) return DEFAULT_COLOR
    const o = overrides?.[key]
    if (o) return o
    let h = 0
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
    return PALETTE[h % PALETTE.length] ?? DEFAULT_COLOR
}

const SAFE_COLOR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/-]+\))$/i

/** Accepts hex / rgb() / hsl() only: served option colours end up in styles and map paint (names fall back to the palette). */
export function safeColor(c: unknown): string | undefined {
    return typeof c === 'string' && SAFE_COLOR.test(c.trim()) ? c.trim() : undefined
}

/** Black or white, whichever reads better on `hex` (WCAG relative luminance). */
export function readableOn(hex: string): string {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
    if (!m) return '#fff'
    let h = m[1] as string
    if (h.length === 3) h = h.replace(/./g, (c) => c + c)
    const ch = [0, 2, 4].map((i) => {
        const v = parseInt(h.slice(i, i + 2), 16) / 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    })
    const l = 0.2126 * (ch[0] as number) + 0.7152 * (ch[1] as number) + 0.0722 * (ch[2] as number)
    return l > 0.4 ? '#111' : '#fff'
}
