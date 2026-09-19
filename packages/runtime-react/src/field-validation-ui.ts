// Shared helpers for painting + toasting client/server field validation so
// action modals and DynamicRecordDialog stay in lockstep.
import type { ActionFieldDef } from './types'
import type { Translate } from './server-error'

function itemFieldsOf(field: ActionFieldDef): ActionFieldDef[] {
    const raw = field.itemFields ?? (field as { item_fields?: ActionFieldDef[] }).item_fields
    return Array.isArray(raw) ? raw : []
}

function translateLabel(raw: string | undefined, t?: Translate): string {
    if (!raw) return ''
    if (!t) return raw
    return t(raw, { defaultValue: raw })
}

function humanizeToken(key: string): string {
    return key.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Resolve a validation path (`customer_id`, `lines.0.unit_price`) to a
 * human label using the action/modal field schema. Nested line-item paths
 * become "Renglones → Precio unitario (fila 1)".
 */
export function labelForValidationPath(
    path: string,
    fields: readonly ActionFieldDef[] | undefined,
    t?: Translate,
): string {
    if (!path) return ''
    const parts = path.split('.')
    if (!fields?.length) return humanizeToken(path)

    let cursor: readonly ActionFieldDef[] | undefined = fields
    const bits: string[] = []
    let i = 0
    while (i < parts.length && cursor) {
        const seg = parts[i]!
        if (/^\d+$/.test(seg)) {
            const row = Number(seg) + 1
            const nextKey = parts[i + 1]
            if (nextKey && cursor) {
                const col = cursor.find((f) => f.key === nextKey)
                const colLabel = translateLabel(col?.label, t) || humanizeToken(nextKey)
                bits.push(`${colLabel} (fila ${row})`)
                i += 2
                cursor = undefined
                continue
            }
            bits.push(`fila ${row}`)
            i += 1
            continue
        }
        const field = cursor.find((f) => f.key === seg)
        if (!field) {
            bits.push(humanizeToken(parts.slice(i).join('.')))
            break
        }
        bits.push(translateLabel(field.label, t) || humanizeToken(seg))
        const nested = itemFieldsOf(field)
        cursor = nested.length ? nested : undefined
        i += 1
        if (!cursor && i < parts.length) {
            bits.push(humanizeToken(parts.slice(i).join('.')))
            break
        }
    }
    return bits.join(' → ')
}

/** Build `{path: label}` covering scalar fields and `parent.N.child` templates
 *  used by localizeFieldErrorMap (exact keys win when present). */
export function labelsForValidationFields(
    fields: readonly ActionFieldDef[] | undefined,
    t?: Translate,
): Record<string, string> {
    const out: Record<string, string> = {}
    if (!fields) return out
    for (const f of fields) {
        if (!f.key) continue
        out[f.key] = translateLabel(f.label, t) || humanizeToken(f.key)
        for (const child of itemFieldsOf(f)) {
            if (!child.key) continue
            out[`${f.key}.${child.key}`] = translateLabel(child.label, t) || humanizeToken(child.key)
        }
    }
    return out
}

/**
 * Toast description: one "Label: message" line per error. Re-resolves labels
 * for dotted line-item paths so operators see e.g.
 * "Precio unitario (fila 1): es obligatorio" instead of a bare headline.
 */
export function formatFieldErrorsDescription(
    errors: Record<string, string>,
    fields?: readonly ActionFieldDef[],
    t?: Translate,
): string | undefined {
    const entries = Object.entries(errors)
    if (!entries.length) return undefined
    return entries
        .map(([path, msg]) => {
            const label = labelForValidationPath(path, fields, t)
            // localizeFieldIssue already prefixes "{{label}}: …" — avoid
            // "Label: Label: msg" when the message already starts with the label.
            if (label && msg.toLowerCase().startsWith(label.toLowerCase())) return msg
            return label ? `${label}: ${msg}` : msg
        })
        .join(' · ')
}

/** Drop `key` and every `key.*` / `key.N.*` entry after the operator edits that field. */
export function clearFieldErrorTree(
    prev: Record<string, string>,
    key: string,
): Record<string, string> {
    if (!prev[key] && !Object.keys(prev).some((k) => k.startsWith(`${key}.`))) return prev
    const next: Record<string, string> = {}
    for (const [k, v] of Object.entries(prev)) {
        if (k === key || k.startsWith(`${key}.`)) continue
        next[k] = v
    }
    return next
}

/** Slice `parent.0.child` errors into `{ "0.child": msg }` for DynamicLineItems. */
export function lineItemErrorsFor(
    parentKey: string,
    errors: Record<string, string> | undefined,
): Record<string, string> {
    if (!errors) return {}
    const prefix = `${parentKey}.`
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(errors)) {
        if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v
    }
    return out
}
