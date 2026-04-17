/**
 * Centralized color resolution for OptionDef.color (badges, dots, filters).
 *
 * Backend metadata can express option colors either as Tailwind-style semantic
 * names (`"green"`, `"emerald"`, `"blue"`, ...) — the preferred convention —
 * or as raw hex (`"#22c55e"`). Every consumer (table cell badges, filter
 * pills, column header chips) must funnel through this module so the visual
 * language stays consistent across the app and the theme palette only needs
 * to be updated in one place.
 */

// Tailwind-500 palette. Keep in sync with tailwind.config if it diverges.
const COLOR_MAP: Record<string, string> = {
    red: 'ef4444',
    orange: 'f97316',
    amber: 'f59e0b',
    yellow: 'eab308',
    lime: '84cc16',
    green: '22c55e',
    emerald: '10b981',
    teal: '14b8a6',
    cyan: '06b6d4',
    sky: '0ea5e9',
    blue: '3b82f6',
    indigo: '6366f1',
    violet: '8b5cf6',
    purple: 'a855f7',
    fuchsia: 'd946ef',
    pink: 'ec4899',
    rose: 'f43f5e',
    gray: '6b7280',
    slate: '64748b',
    zinc: '71717a',
    neutral: '737373',
    stone: '78716c',
}

/**
 * Returns a 6-digit hex string (no `#`) for an OptionDef color value, accepting
 * either a semantic name from COLOR_MAP or any hex literal.
 */
export const resolveColorHex = (input: string): string => {
    if (!input) return ''
    const named = COLOR_MAP[input.toLowerCase()]
    if (named) return named
    return input.replace('#', '')
}

/** Returns a `#xxxxxx` CSS-safe color literal — handy for inline styles. */
export const resolveColorCss = (input: string): string => {
    const hex = resolveColorHex(input)
    return hex ? `#${hex}` : ''
}

interface BadgeStyleOptions {
    isDark: boolean
}

/**
 * Builds the inline style object for a colored badge (background + border +
 * text), tinted in the OptionDef color and adapted to light/dark mode.
 */
export const generateBadgeStyles = (
    input: string,
    { isDark }: BadgeStyleOptions,
): React.CSSProperties => {
    const hex = resolveColorHex(input)
    if (hex.length < 6) return {}
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)

    if (isDark) {
        return {
            backgroundColor: `rgba(${r}, ${g}, ${b}, 0.2)`,
            color: `rgb(${Math.min(255, Math.floor(r * 1.2))}, ${Math.min(255, Math.floor(g * 1.2))}, ${Math.min(255, Math.floor(b * 1.2))})`,
            border: `1px solid rgba(${r}, ${g}, ${b}, 0.5)`,
            fontWeight: 500,
        }
    }
    return {
        backgroundColor: `rgba(${r}, ${g}, ${b}, 0.12)`,
        color: `rgb(${Math.floor(r * 0.5)}, ${Math.floor(g * 0.5)}, ${Math.floor(b * 0.5)})`,
        border: `1px solid rgba(${r}, ${g}, ${b}, 0.25)`,
        fontWeight: 500,
    }
}
