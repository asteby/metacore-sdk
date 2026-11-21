// Declarative fitment: pure matching over `FitmentRule` rows. No UI, no I/O,
// no industry vocabulary: a rule says "a SUBJECT with these attributes fits a
// TARGET with these attributes" and the model names / attribute keys are data
// (vehicle ↔ tire size, device ↔ consumable, machine ↔ spare part, …).
//
// Attribute spec (same grammar on both sides of a rule):
//   scalar            → equality (text compared trimmed + case-insensitive;
//                       numbers compared numerically, so "17" equals 17)
//   array             → set: the value must equal any element
//   { from?, to? }    → inclusive numeric range, either bound optional
// A rule whose `subject_attrs` is empty applies to EVERY subject of its model
// ("universal"). Nothing here decides fitment on its own: it only compares what
// the organization published in its rules.

/** One row of the `catalog_fitment` addon's `FitmentRule` model. */
export interface FitmentRule {
    id?: string
    subject_model: string
    subject_attrs: Record<string, unknown>
    target_model: string
    target_attrs: Record<string, unknown>
    note?: string
    is_active?: boolean
}

/** Attribute bag of a subject or a target (e.g. a Vehicle row, a product's spec). */
export type FitmentAttrs = Record<string, unknown>

/** Result of asking "does this target fit this subject?". */
export type FitState =
    /** At least one applicable rule accepts the target. */
    | 'fits'
    /** Rules exist for the subject and target model, none accepts the target (the target does carry the compared attributes). */
    | 'no'
    /** No rule says anything about this subject: do not claim either way. */
    | 'unknown'

const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v)

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

/** Attributes can arrive as an object or as serialized JSON (jsonb column). */
export function parseAttrs(raw: unknown): FitmentAttrs {
    if (isRecord(raw)) return raw
    if (typeof raw === 'string' && raw.trim().startsWith('{')) {
        try {
            const parsed: unknown = JSON.parse(raw)
            return isRecord(parsed) ? parsed : {}
        } catch {
            return {}
        }
    }
    return {}
}

const norm = (v: unknown) => String(v).trim().toLowerCase()

function toNumber(v: unknown): number | null {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v.trim().replace(',', '.'))
        return Number.isFinite(n) ? n : null
    }
    return null
}

function scalarEquals(a: unknown, b: unknown): boolean {
    const na = toNumber(a)
    const nb = toNumber(b)
    if (na !== null && nb !== null) return na === nb
    return norm(a) === norm(b)
}

/** True when `value` satisfies one attribute `spec` (scalar / array / range). */
export function matchesSpec(spec: unknown, value: unknown): boolean {
    if (isBlank(value)) return false
    if (Array.isArray(value)) return value.some((v) => matchesSpec(spec, v))
    if (Array.isArray(spec)) return spec.some((s) => scalarEquals(s, value))
    if (isRecord(spec)) {
        const n = toNumber(value)
        if (n === null) return false
        const from = spec.from === undefined || spec.from === null ? null : toNumber(spec.from)
        const to = spec.to === undefined || spec.to === null ? null : toNumber(spec.to)
        if (from === null && to === null) return false // an empty range constrains nothing: refuse rather than match all
        if (from !== null && n < from) return false
        if (to !== null && n > to) return false
        return true
    }
    if (isBlank(spec)) return false
    return scalarEquals(spec, value)
}

/** Every attribute the rule side constrains must be satisfied by the bag. Empty spec ⇒ matches. */
export function matchesAttrs(spec: unknown, attrs: FitmentAttrs): boolean {
    const wanted = parseAttrs(spec)
    return Object.keys(wanted).every((k) => matchesSpec(wanted[k], attrs[k]))
}

const active = (r: FitmentRule) => r.is_active !== false

/** Active rules whose subject side accepts `subject` (a Vehicle row, a device, …). */
export function rulesForSubject(rules: readonly FitmentRule[], subjectModel: string, subject: FitmentAttrs): FitmentRule[] {
    return rules.filter((r) => active(r) && r.subject_model === subjectModel && matchesAttrs(r.subject_attrs, subject))
}

const MAX_RANGE_VALUES = 100

function specValues(spec: unknown): string[] {
    if (Array.isArray(spec)) return spec.filter((v) => !isBlank(v) && !isRecord(v)).map((v) => String(v).trim())
    if (isRecord(spec)) {
        const from = toNumber(spec.from)
        const to = toNumber(spec.to)
        if (from === null || to === null || to < from || to - from >= MAX_RANGE_VALUES) return []
        const out: string[] = []
        for (let n = Math.ceil(from); n <= Math.floor(to); n++) out.push(String(n))
        return out
    }
    return isBlank(spec) ? [] : [String(spec).trim()]
}

/**
 * Values the rules offer for one subject attribute, given what is already chosen: the options of a
 * cascading selector (make → model → year). Only rules compatible with `chosen` count; a rule that
 * does not constrain `attrKey` offers nothing (it applies to any value, so it cannot be enumerated).
 * Ranges are expanded to whole numbers (at most 100); the result is deduplicated and sorted
 * numerically when every value is a number, alphabetically otherwise.
 */
export function subjectOptions(
    rules: readonly FitmentRule[],
    subjectModel: string,
    attrKey: string,
    chosen: FitmentAttrs = {},
): string[] {
    const seen = new Map<string, string>()
    for (const r of rules) {
        if (!active(r) || r.subject_model !== subjectModel) continue
        const spec = parseAttrs(r.subject_attrs)
        const compatible = Object.keys(chosen).every((k) => !(k in spec) || isBlank(chosen[k]) || matchesSpec(spec[k], chosen[k]))
        if (!compatible || !(attrKey in spec)) continue
        for (const v of specValues(spec[attrKey])) if (!seen.has(norm(v))) seen.set(norm(v), v)
    }
    const list = [...seen.values()]
    return list.every((v) => toNumber(v) !== null)
        ? list.sort((a, b) => Number(a) - Number(b))
        : list.sort((a, b) => a.localeCompare(b))
}

/**
 * Distinct target attribute bags the subject accepts (e.g. the tire sizes of a
 * vehicle), in rule order. `targetModel` narrows when a subject model has
 * rules toward several target models.
 */
export function targetsForSubject(
    rules: readonly FitmentRule[],
    subjectModel: string,
    subject: FitmentAttrs,
    targetModel?: string,
): FitmentAttrs[] {
    const seen = new Set<string>()
    const out: FitmentAttrs[] = []
    for (const r of rulesForSubject(rules, subjectModel, subject)) {
        if (targetModel && r.target_model !== targetModel) continue
        const t = parseAttrs(r.target_attrs)
        const key = JSON.stringify(Object.keys(t).sort().map((k) => [k, t[k]]))
        if (seen.has(key)) continue
        seen.add(key)
        out.push(t)
    }
    return out
}

/**
 * Attribute bag of a target row. A product list row carries the columns of
 * extension models as `"<Model>.<column>"` (e.g. `"TireSpec.rim_diameter_in"`)
 * and variants carry an `attributes` object: all are folded in, so the caller
 * can hand over the raw row and a rule can name just the row's own model
 * (`Product`) without knowing which extension adds the attributes. Precedence:
 * plain keys, then `<targetModel>.<column>`, then other extensions, then `attributes`.
 */
export function targetAttrsOf(row: FitmentAttrs, targetModel: string): FitmentAttrs {
    const own: FitmentAttrs = {}
    const others: FitmentAttrs = {}
    const prefix = `${targetModel}.`
    for (const k of Object.keys(row)) {
        const dot = k.indexOf('.')
        if (dot <= 0) continue
        if (k.startsWith(prefix)) own[k.slice(prefix.length)] = row[k]
        else others[k.slice(dot + 1)] = row[k]
    }
    return { ...parseAttrs(row.attributes), ...others, ...own, ...row }
}

/**
 * Fit state of `target` (the attributes of a product / part / consumable) for
 * `subject`. `unknown` when no active rule covers the subject for that target
 * model: the UI must not warn or filter in that case.
 */
export function fitFor(
    rules: readonly FitmentRule[],
    subjectModel: string,
    subject: FitmentAttrs,
    targetModel: string,
    target: FitmentAttrs,
): FitState {
    const applicable = rulesForSubject(rules, subjectModel, subject).filter((r) => r.target_model === targetModel)
    if (applicable.length === 0) return 'unknown'
    const bag = targetAttrsOf(target, targetModel)
    // A target that carries none of the attributes the rules constrain (a service, a product of
    // another kind) is not "wrong", it is not comparable: say nothing.
    const constrained = new Set(applicable.flatMap((r) => Object.keys(parseAttrs(r.target_attrs))))
    if (![...constrained].some((k) => !isBlank(bag[k]))) return 'unknown'
    return applicable.some((r) => matchesAttrs(r.target_attrs, bag)) ? 'fits' : 'no'
}

/** Normalises a raw `/data/FitmentRule` row (jsonb as object or string). */
export function toFitmentRule(raw: Record<string, unknown>): FitmentRule {
    return {
        id: raw.id === undefined || raw.id === null ? undefined : String(raw.id),
        subject_model: String(raw.subject_model ?? ''),
        subject_attrs: parseAttrs(raw.subject_attrs),
        target_model: String(raw.target_model ?? ''),
        target_attrs: parseAttrs(raw.target_attrs),
        note: typeof raw.note === 'string' && raw.note ? raw.note : undefined,
        is_active: raw.is_active === false ? false : true,
    }
}
