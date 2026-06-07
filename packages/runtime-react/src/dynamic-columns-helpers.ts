// Pure, DOM-free helpers for the dynamic-column / record / relation renderers.
// Kept in their own module so they unit-test in node (no React, no
// metacore-ui primitives) and the same logic is shared across every cell
// renderer.

// Short, case-insensitive list of tokens that read better fully capitalized
// than Title-Cased. Intentionally tiny: this is a last-resort fallback, not a
// dictionary. Addons localize real labels via the column `options`.
const ACRONYMS: Record<string, string> = {
    pos: 'POS',
    sku: 'SKU',
    id: 'ID',
    url: 'URL',
    api: 'API',
    iva: 'IVA',
    rfc: 'RFC',
}

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Scalable safety net for enum/status/option values that have **no matching
 * declared option**. Turns a raw machine token into a readable label so a cell
 * never leaks `in_progress` / `out-of-stock` verbatim:
 *
 *   - `in_progress` → `In Progress`   (snake_case)
 *   - `out-of-stock` → `Out Of Stock` (kebab-case)
 *   - `payment.failed` → `Payment Failed` (dotted)
 *   - `sale` → `Sale`                 (single word)
 *   - `pos` → `POS`, `sku_count` → `SKU Count` (acronyms uppercased)
 *
 * This is a FALLBACK only. The localized source of truth is the `options` an
 * addon declares; callers must prefer a matched `option.label` and only reach
 * for `humanizeToken` when nothing matched.
 *
 * Values that don't look like an enum token are returned unchanged: anything
 * already containing whitespace (free text), overly long strings, UUIDs, and
 * non-strings. This keeps it safe to call on arbitrary cell values.
 */
export function humanizeToken(value: unknown): string {
    if (typeof value !== 'string') return value == null ? '' : String(value)
    const raw = value
    const trimmed = raw.trim()
    // Already human (has spaces), empty, or free-form long text → leave as-is.
    if (trimmed === '' || /\s/.test(trimmed) || trimmed.length > 40) return raw
    // UUIDs (unresolved FKs) contain dashes but are not enum tokens.
    if (UUID_RE.test(trimmed)) return raw
    const parts = trimmed.split(/[_.\-]+/).filter(Boolean)
    if (parts.length === 0) return raw
    return parts
        .map((part) => {
            const lower = part.toLowerCase()
            if (ACRONYMS[lower]) return ACRONYMS[lower]
            return lower.charAt(0).toUpperCase() + lower.slice(1)
        })
        .join(' ')
}
