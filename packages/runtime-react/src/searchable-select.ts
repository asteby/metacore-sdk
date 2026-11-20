// Pure rules of the searchable select (combobox with a search box) used by the
// STATIC `select` / `multiselect` widgets. Kept free of React so the threshold
// and the matching are unit-testable and shared with the table filters.
import { matchesSearch, normalizeSearchText } from '@asteby/metacore-ui/lib'

/**
 * Option count above which a static select becomes a searchable combobox when
 * the field does not say otherwise. Mirrors the kernel constant
 * `modelbase.SearchableSelectThreshold`. At or below it the flat select stays.
 */
export const SEARCHABLE_SELECT_THRESHOLD = 8

/**
 * Rows rendered at once in the list. Static lists are filtered client-side, so
 * a long catalog (hundreds of rows) is windowed instead of painting every row:
 * the match set is cut to this many (the selected option is always kept) and
 * the list says how many more there are. Typing narrows it.
 */
export const SEARCHABLE_SELECT_MAX_ROWS = 100

export interface SearchableSelectConfig {
    /** `true` forces the combobox, `false` the flat select, unset = by option count. */
    searchable?: boolean | null
    /** Per-field override of the threshold (`searchThreshold`). */
    searchThreshold?: number | null
}

/** Should a static select with `count` options render as a searchable combobox? */
export function isSearchableSelect(field: SearchableSelectConfig | undefined | null, count: number): boolean {
    if (field?.searchable === true) return true
    if (field?.searchable === false) return false
    const t = field?.searchThreshold
    const threshold = typeof t === 'number' && Number.isFinite(t) && t >= 0 ? t : SEARCHABLE_SELECT_THRESHOLD
    return count > threshold
}

export interface SearchableOptionLike {
    value: unknown
    label: string
    description?: string | null
}

/** Text an option is matched against: label, code (value) and description. */
export function optionHaystack(o: SearchableOptionLike): string {
    return `${o.label ?? ''} ${o.value ?? ''} ${o.description ?? ''}`
}

/**
 * Filters options by `query` (case/accent insensitive, every token must hit the
 * label, value or description) and ranks them: label or code starts with the
 * query, then a word of the label starts with it, then any other hit. The
 * original order is kept inside each rank. An empty query returns a copy of the
 * list untouched.
 */
export function filterSearchableOptions<T extends SearchableOptionLike>(options: readonly T[], query: string): T[] {
    const q = normalizeSearchText(query)
    if (!q) return options.slice()
    const first = q.split(' ')[0]!
    const ranked: Array<{ o: T; rank: number; i: number }> = []
    options.forEach((o, i) => {
        if (!matchesSearch(optionHaystack(o), q)) return
        const label = normalizeSearchText(o.label)
        const code = normalizeSearchText(o.value)
        let rank = 3
        if (label.startsWith(q) || code.startsWith(q)) rank = 0
        else if (label.split(/[^a-z0-9]+/).some((w) => w.startsWith(first))) rank = 1
        else if (label.includes(q)) rank = 2
        ranked.push({ o, rank, i })
    })
    ranked.sort((a, b) => a.rank - b.rank || a.i - b.i)
    return ranked.map((r) => r.o)
}

/**
 * Cuts a match list to `max` rows, always keeping the selected one(s) so the
 * list never loses them. Returns the window and how many rows were hidden.
 */
export function windowOptions<T>(
    rows: readonly T[],
    max: number,
    isSelected: (o: T) => boolean,
): { rows: T[]; hidden: number } {
    if (rows.length <= max) return { rows: rows.slice(), hidden: 0 }
    const head = rows.slice(0, max)
    const missing = rows.slice(max).filter(isSelected)
    return { rows: [...head, ...missing], hidden: rows.length - max - missing.length }
}
