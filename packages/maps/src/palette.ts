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
