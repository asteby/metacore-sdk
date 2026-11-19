// Human text for the raw words a map block carries: column keys (`ops_version`), status values (`live_24h`) and area
// codes (`GT`). Nothing here is hard-coded per product: the document supplies labels (optional `field_labels` /
// `status_labels` maps, or the host's i18n under the `map.field.*` / `map.status.*` convention), and what stays
// unlabelled is made readable instead of being printed raw.

/** Resolves a document text (`string` or `{ $t, args }`) the way the host does. */
export type TextFn = (v: unknown) => string

/** i18n key prefixes the host can translate without the document naming each label. */
export const FIELD_LABEL_PREFIX = 'map.field.'
export const STATUS_LABEL_PREFIX = 'map.status.'

/** `ops_version` -> `Ops version`, `live_24h` -> `Live 24h`, `lastSeenAt` -> `Last seen at`. */
export function humanize(key: string): string {
    // Only identifiers are rewritten: text that is already prose ("En línea", "OK", "Acme Corp") is left alone.
    if (/\s/.test(key) || (key !== key.toLowerCase() && !/[a-z0-9][A-Z]/.test(key) && !/[_\-.:]/.test(key))) return key
    const words = key
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_\-.:]+/g, ' ')
        .trim()
        .toLowerCase()
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : key
}

/** The translation of an i18n key, or undefined when the host has none (i18next answers with the key itself). */
export function translateKey(text: TextFn, key: string): string | undefined {
    const out = text({ $t: key }).trim()
    return out && out !== key && !key.endsWith(out) ? out : undefined
}

export interface Terms {
    /** Label of a source column. */
    field: (key: string) => string
    /** Text of a status value. */
    status: (value: string) => string
}

type LabelMap = Record<string, unknown>
const own = (m: LabelMap | undefined, k: string): unknown => (m && typeof m === 'object' && Object.hasOwn(m, k) ? m[k] : undefined)

/**
 * Terms of a block. Order for each word: the explicit map of the block (`field_labels` / `status_labels`, values are
 * texts or `$t` refs), then the host's translation under the convention prefix, then a readable fallback.
 */
export function makeTerms(block: { field_labels?: unknown; status_labels?: unknown }, text: TextFn): Terms {
    const fields = block.field_labels as LabelMap | undefined
    const statuses = block.status_labels as LabelMap | undefined
    const pick = (map: LabelMap | undefined, prefix: string, key: string): string => {
        const explicit = own(map, key)
        const direct = explicit === undefined ? '' : text(explicit).trim()
        return direct || translateKey(text, prefix + key) || humanize(key)
    }
    return {
        field: (key) => pick(fields, FIELD_LABEL_PREFIX, key),
        status: (value) => pick(statuses, STATUS_LABEL_PREFIX, value),
    }
}

/** Country / region name of an ISO 3166-1 alpha-2 code in `locale` (`GT` -> `Guatemala`); the code itself when unknown. */
export function regionName(code: string, locale?: string): string {
    if (!/^[A-Za-z]{2}$/.test(code)) return code
    try {
        const name = new Intl.DisplayNames(locale ? [locale] : undefined, { type: 'region' }).of(code.toUpperCase())
        return name && name !== code.toUpperCase() ? name : code
    } catch {
        return code
    }
}
