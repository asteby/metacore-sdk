// Client-side twin of kernel `validate`: Laravel / go-playground rule strings
// plus the structured {regex,min,max,custom} object. Produces the same
// {code, params} issues the 422 envelope carries, so UI and server paint
// the same keys.
import type { ActionFieldDef, FieldValidation } from './types'
import type { FieldIssue } from './server-error'

const NIL_UUID = '00000000-0000-0000-0000-000000000000'
const NUMERIC_TYPES = new Set(['int', 'integer', 'bigint', 'decimal', 'numeric', 'number', 'float', 'double'])

export interface ValidationSpec {
    required?: boolean
    type?: string
    regex?: string
    min?: number
    max?: number
    custom?: string
    options?: string[]
}

const RULE_NAMES = new Set([
    'required', 'nullable', 'sometimes', 'present',
    'min', 'max', 'regex', 'email', 'uuid', 'url',
    'numeric', 'integer', 'int', 'in',
])

/** Parse `required|min:2|email` or `required,min=2,max=100` or a custom slug. */
export function parseRuleString(s: string): ValidationSpec {
    const spec: ValidationSpec = {}
    const trimmed = s.trim()
    if (!trimmed) return spec
    for (const part of splitRules(trimmed)) {
        const { name, param } = splitNameParam(part)
        switch (name.toLowerCase()) {
            case 'required':
                spec.required = true
                break
            case 'min': {
                const n = Number(param)
                if (!Number.isNaN(n)) spec.min = n
                break
            }
            case 'max': {
                const n = Number(param)
                if (!Number.isNaN(n)) spec.max = n
                break
            }
            case 'regex':
                spec.regex = trimLaravelRegex(param)
                break
            case 'email':
            case 'uuid':
            case 'url':
            case 'numeric':
            case 'integer':
                spec.custom = name.toLowerCase()
                break
            case 'int':
                spec.custom = 'integer'
                break
            case 'in':
                spec.options = param.split(',').map(x => x.trim()).filter(Boolean)
                break
            default:
                if (!spec.custom) spec.custom = part
        }
    }
    return spec
}

function splitRules(s: string): string[] {
    if (s.includes('|')) return s.split('|').map(x => x.trim()).filter(Boolean)
    const raw = s.split(',')
    const out: string[] = []
    for (const p of raw) {
        const part = p.trim()
        if (!part) continue
        const { name } = splitNameParam(part)
        if (!RULE_NAMES.has(name.toLowerCase()) && out.length) {
            const prev = splitNameParam(out[out.length - 1]!).name
            if (prev.toLowerCase() === 'in') {
                out[out.length - 1] += `,${part}`
                continue
            }
        }
        out.push(part)
    }
    return out
}

function splitNameParam(p: string): { name: string; param: string } {
    const colon = p.indexOf(':')
    const eq = p.indexOf('=')
    const i = colon >= 0 && (eq < 0 || colon < eq) ? colon : eq
    if (i < 0) return { name: p.trim(), param: '' }
    return { name: p.slice(0, i).trim(), param: p.slice(i + 1).trim() }
}

function trimLaravelRegex(p: string): string {
    if (p.length >= 2 && p.startsWith('/') && p.lastIndexOf('/') > 0) {
        return p.slice(1, p.lastIndexOf('/'))
    }
    return p
}

/** Normalize ActionFieldDef.validation (object, laravel string, or `rules`). */
export function fieldValidationOf(field: ActionFieldDef | Record<string, unknown>): FieldValidation {
    const rec = field as Record<string, unknown>
    const raw = rec.validation ?? rec.rules ?? rec.validation_rule
    if (!raw) return {}
    if (typeof raw === 'string') {
        const s = parseRuleString(raw)
        return { regex: s.regex, min: s.min, max: s.max, custom: s.custom }
    }
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw as FieldValidation
    return {}
}

function isEmpty(raw: unknown): boolean {
    if (raw == null) return true
    if (typeof raw === 'string') {
        const t = raw.trim()
        return t === '' || t === NIL_UUID
    }
    if (Array.isArray(raw)) return raw.length === 0
    return false
}

function asString(raw: unknown): string {
    if (raw == null) return ''
    return String(raw).trim()
}

function isNumeric(raw: unknown): boolean {
    if (typeof raw === 'number' && Number.isFinite(raw)) return true
    if (typeof raw === 'string') return raw.trim() !== '' && !Number.isNaN(Number(raw))
    return false
}

function numericValue(raw: unknown): number {
    return typeof raw === 'number' ? raw : Number(asString(raw))
}

function lengthOf(raw: unknown): number {
    if (typeof raw === 'string') return [...raw.trim()].length
    if (Array.isArray(raw)) return raw.length
    return [...asString(raw)].length
}

/** Evaluate spec against one value; collect every issue (not fail-fast). */
export function checkValue(value: unknown, spec: ValidationSpec): FieldIssue[] {
    const empty = isEmpty(value)
    if (spec.required && empty) return [{ code: 'required' }]
    if (empty) return []
    const out: FieldIssue[] = []
    const typ = (spec.type ?? '').toLowerCase()
    if (NUMERIC_TYPES.has(typ) && !isNumeric(value)) {
        out.push({ code: 'invalid_type', params: { expected: 'number' } })
        return out
    }
    if (spec.options && spec.options.length) {
        const want = asString(value)
        if (!spec.options.includes(want)) {
            out.push({ code: 'invalid_option', params: { allowed: spec.options } })
        }
    }
    if (spec.regex) {
        try {
            if (!new RegExp(spec.regex).test(asString(value))) {
                out.push({ code: 'regex', params: { pattern: spec.regex } })
            }
        } catch { /* malformed — skip */ }
    }
    if (spec.min != null || spec.max != null) {
        const isNum = NUMERIC_TYPES.has(typ)
        const kind = isNum ? 'value' : 'length'
        const n = isNum ? numericValue(value) : lengthOf(value)
        if (spec.min != null && n < spec.min) out.push({ code: 'min', params: { min: spec.min, kind } })
        if (spec.max != null && n > spec.max) out.push({ code: 'max', params: { max: spec.max, kind } })
    }
    if (spec.custom) {
        const custom = checkBuiltin(spec.custom, value)
        if (custom) out.push(custom)
    }
    return out
}

function checkBuiltin(slug: string, value: unknown): FieldIssue | undefined {
    const s = asString(value)
    switch (slug) {
        case 'email':
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? undefined : { code: 'email' }
        case 'uuid':
            return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
                ? undefined : { code: 'uuid' }
        case 'url':
            try { const u = new URL(s); return u.protocol && u.host ? undefined : { code: 'url' } }
            catch { return { code: 'url' } }
        case 'numeric':
            return isNumeric(value) ? undefined : { code: 'numeric', params: { expected: 'number' } }
        case 'integer':
        case 'int':
            return /^-?\d+$/.test(s) || (typeof value === 'number' && Number.isInteger(value))
                ? undefined : { code: 'integer', params: { expected: 'integer' } }
        default:
            return undefined
    }
}

function specFromField(field: ActionFieldDef): ValidationSpec {
    const v = fieldValidationOf(field)
    const spec: ValidationSpec = {
        required: !!field.required,
        type: field.type,
        regex: v.regex,
        min: v.min,
        max: v.max,
        custom: v.custom,
    }
    if (field.options?.length) spec.options = field.options.map(o => String(o.value))
    return spec
}

function isLineItems(field: ActionFieldDef): boolean {
    const raw = field.itemFields ?? (field as { item_fields?: ActionFieldDef[] }).item_fields
    return Array.isArray(raw) && raw.length > 0
}

function itemFieldsOf(field: ActionFieldDef): ActionFieldDef[] {
    const raw = field.itemFields ?? (field as { item_fields?: ActionFieldDef[] }).item_fields
    return Array.isArray(raw) ? raw : []
}

/** Validate a form payload the way Laravel's Validator does: collect every
 *  field issue, dotted keys for line-items (`items.0.qty`). */
export function validateValues(
    fields: readonly ActionFieldDef[],
    values: Record<string, unknown>,
): Record<string, FieldIssue[]> {
    const bag: Record<string, FieldIssue[]> = {}
    walk(fields, values ?? {}, '', bag)
    return bag
}

function walk(
    fields: readonly ActionFieldDef[],
    values: Record<string, unknown>,
    prefix: string,
    bag: Record<string, FieldIssue[]>,
): void {
    for (const field of fields) {
        const key = field.key
        if (!key) continue
        const path = prefix ? `${prefix}.${key}` : key
        const raw = values[key]
        if (isLineItems(field)) {
            const rows = Array.isArray(raw) ? raw : []
            if (field.required && rows.length === 0) {
                bag[path] = [{ code: 'line_items_required' }]
                continue
            }
            rows.forEach((row, i) => {
                const obj = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
                walk(itemFieldsOf(field), obj, `${path}.${i}`, bag)
            })
            continue
        }
        const issues = checkValue(raw, specFromField(field))
        if (issues.length) bag[path] = issues
    }
}

export function bagHasErrors(bag: Record<string, FieldIssue[]>): boolean {
    return Object.keys(bag).length > 0
}
