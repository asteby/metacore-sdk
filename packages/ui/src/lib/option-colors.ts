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
  { isDark }: BadgeStyleOptions
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

/**
 * Curated, cohesive palette used to colorize options/relations that ship
 * WITHOUT an explicit `color` from the backend. These are well-known
 * Tailwind-500 hues, hand-picked to read well as soft chips in BOTH light and
 * dark mode and to avoid muddy/low-contrast tones (no bare yellow that vanishes
 * on white). Order is intentional so the first handful of distinct values land
 * on visually distant hues rather than neighbours on the color wheel.
 */
export const OPTION_PALETTE: readonly string[] = [
  'ef4444', // red
  '3b82f6', // blue
  '22c55e', // green
  'f97316', // orange
  '8b5cf6', // violet
  '06b6d4', // cyan
  'ec4899', // pink
  '14b8a6', // teal
  'f59e0b', // amber
  '6366f1', // indigo
  '84cc16', // lime
  'a855f7', // purple
  '0ea5e9', // sky
  'f43f5e', // rose
  '10b981', // emerald
  'd946ef', // fuchsia
]

/**
 * Deterministic 32-bit FNV-1a hash of a string. Stable across renders,
 * sessions and runtimes (pure arithmetic, no Math.random / Date). Picks a
 * palette slot for a given option key so the same value always maps to the same
 * color, and equal words share a color.
 */
const hashString = (input: string): number => {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    // hash *= 16777619 (FNV prime), kept in the 32-bit unsigned range.
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/**
 * Maps an arbitrary option key (its `value`, falling back to `label`) to a
 * stable hex color drawn from {@link OPTION_PALETTE}. Same input → same color,
 * always; similar/equal inputs collapse to the same hue because the hash is on
 * the normalized key. This is what makes "dead" gray option badges feel ALIVE
 * without the backend declaring a color per option.
 *
 * The returned hex has NO leading `#` so it funnels through the same
 * {@link generateBadgeStyles} / {@link resolveColorCss} helpers as an explicit
 * OptionDef color.
 */
export const optionColor = (key: string): string => {
  const normalized = (key ?? '').trim().toLowerCase()
  if (!normalized) return OPTION_PALETTE[0]
  return OPTION_PALETTE[hashString(normalized) % OPTION_PALETTE.length]
}

/**
 * Ready-to-use inline badge style for a key-derived palette color, in the
 * requested light/dark variant. Equivalent to
 * `generateBadgeStyles(optionColor(key), { isDark })`.
 */
export const optionColorBadgeStyles = (
  key: string,
  { isDark }: BadgeStyleOptions
): React.CSSProperties => generateBadgeStyles(optionColor(key), { isDark })

/**
 * Inline style for a RELATION chip keyed on the related label/id. Intentionally
 * lighter than an enum badge: soft tinted background + matching border, but no
 * heavy fill — so relations stay visually distinguishable from option/status
 * enums while still reading as "alive" rather than dead gray.
 */
export const relationChipStyles = (
  key: string,
  { isDark }: BadgeStyleOptions
): React.CSSProperties => {
  const hex = optionColor(key)
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  if (isDark) {
    return {
      backgroundColor: `rgba(${r}, ${g}, ${b}, 0.12)`,
      color: `rgb(${Math.min(255, Math.floor(r * 1.25))}, ${Math.min(255, Math.floor(g * 1.25))}, ${Math.min(255, Math.floor(b * 1.25))})`,
      border: `1px solid rgba(${r}, ${g}, ${b}, 0.3)`,
    }
  }
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.08)`,
    color: `rgb(${Math.floor(r * 0.55)}, ${Math.floor(g * 0.55)}, ${Math.floor(b * 0.55)})`,
    border: `1px solid rgba(${r}, ${g}, ${b}, 0.2)`,
  }
}
