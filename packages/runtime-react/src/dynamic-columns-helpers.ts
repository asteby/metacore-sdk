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

export type MetadataTranslator = (
    key: string,
    options?: { defaultValue?: string },
) => string

/**
 * Resolve addon-contributed metadata at render time. Known i18n keys use the
 * host locale; missing keys degrade to a readable label instead of leaking a
 * machine path such as `models.orders.table.columns.payment_status`.
 */
export function translateMetadataLabel(
    value: string | undefined,
    translate?: MetadataTranslator,
): string {
    if (!value) return ''
    const token = value.includes('.') ? value.split('.').at(-1) ?? value : value
    const fallback = humanizeToken(token)
    if (!translate) return fallback
    const translated = translate(value, { defaultValue: fallback })
    return translated && translated !== value ? translated : fallback
}

// A catalog key as addons write them: lowercase dotted segments
// ("fiscal_mexico.ext.customer.rfc_receptor"). Human labels have spaces,
// capitals or accents and never match.
const CATALOG_KEY_RE = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/

/**
 * Form-field label as the user should read it. The host usually serves labels
 * already localized; when it could not (an extension field whose addon catalog
 * the server did not resolve), the label arrives as the raw catalog key and the
 * form printed `FISCAL_MEXICO.EXT.CUSTOMER.RFC_RECEPTOR`. Such a key is resolved
 * with the client catalog and, failing that, humanized. Any other label is
 * returned untouched.
 */
export function localizeFieldLabel(
    label: string | undefined,
    translate?: MetadataTranslator,
): string {
    if (!label) return ''
    if (!CATALOG_KEY_RE.test(label)) return label
    return translateMetadataLabel(label, translate)
}

/** An option as the table cell paints it (`labelKey` is the unresolved catalog key the host could not translate). */
export interface CellOption {
    value: string | boolean
    label: string
    labelKey?: string
    icon?: string
    color?: string
}

/**
 * The options a table cell must use to paint an enum/status value, so the cell
 * never shows the raw value («Ready») when a translated label exists:
 *
 *   1. the column's own `options`, or — for the model's stage column
 *      (`stage_field`) with none — the `stages[]` labels (Listo, Cumplido…);
 *   2. every label is resolved: an unresolved catalog key (`labelKey`, or a
 *      label that is itself a key) goes through the client catalog and, failing
 *      that, is humanized. A human label is returned untouched.
 *
 * Returns undefined when there is nothing to paint from (the cell then
 * humanizes the token as its last resort).
 */
export function resolveColumnOptions(args: {
    columnKey: string
    options?: CellOption[]
    stages?: { key: string; label?: string; color?: string }[]
    stageField?: string
    translate?: MetadataTranslator
}): CellOption[] | undefined {
    const { columnKey, options, stages, stageField, translate } = args
    let base: CellOption[] | undefined = options && options.length > 0 ? options : undefined
    if (!base && stageField && columnKey === stageField && stages && stages.length > 0) {
        base = stages
            .filter((st) => st && st.key)
            .map((st) => ({ value: st.key, label: st.label || '', color: st.color }))
    }
    if (!base) return undefined
    return base.map((opt) => {
        const source = opt.labelKey || opt.label
        const label = opt.labelKey
            ? translateMetadataLabel(opt.labelKey, translate)
            : opt.label
              ? localizeFieldLabel(opt.label, translate)
              : humanizeToken(String(opt.value))
        return source === label && !opt.labelKey ? opt : { ...opt, label }
    })
}
