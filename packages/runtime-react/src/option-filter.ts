// Option filter — lets a manifest HIDE options of a relation / dynamic picker
// (e.g. keep cancelled invoices out of the "abonos" invoice selector, PIT-059).
//
// The filter runs client-side over the options the resolver already fetched, so
// it needs no kernel change: it reads the extra scalar columns the options
// endpoint returns (they land in `option.meta`) plus the standard `label`,
// `name`, `description`, `color`, `icon` keys. Fully opt-in: a field without
// `option_filter` / `optionFilter` behaves exactly as before.
import type { ResolvedOption } from './use-options-resolver'

export interface OptionFilterRule {
    /** Option property to test: a `meta` key (e.g. `status`) or `id`/`value`/`label`/`name`/`description`/`color`/`icon`. */
    field: string
    /** Keep only options whose value equals this. */
    equals?: string | number | boolean
    /** snake_case alias of `notEquals`. */
    not_equals?: string | number | boolean
    /** Hide options whose value equals this. */
    notEquals?: string | number | boolean
    /** Keep only options whose value is one of these. */
    in?: Array<string | number | boolean>
    /** Hide options whose value is one of these. */
    not_in?: Array<string | number | boolean>
    /** camelCase alias of `not_in`. */
    notIn?: Array<string | number | boolean>
}

/** One rule, or a list of rules that must ALL pass (AND). */
export type OptionFilter = OptionFilterRule | OptionFilterRule[]

type FilterCarrier = { optionFilter?: unknown; option_filter?: unknown }

/** Reads the filter from a field (camelCase or the snake_case the kernel serves). */
export function getOptionFilter(field: unknown): OptionFilterRule[] {
    if (!field || typeof field !== 'object') return []
    const f = field as FilterCarrier
    const raw = f.optionFilter ?? f.option_filter
    const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : []
    return list.filter(
        (r): r is OptionFilterRule =>
            !!r && typeof r === 'object' && typeof (r as OptionFilterRule).field === 'string' && (r as OptionFilterRule).field !== '',
    )
}

function norm(v: unknown): string {
    return String(v).trim().toLowerCase()
}

function readProp(opt: ResolvedOption, key: string): unknown {
    if (key === 'id' || key === 'value' || key === 'label' || key === 'name' || key === 'description' || key === 'color' || key === 'icon' || key === 'image') {
        return (opt as unknown as Record<string, unknown>)[key]
    }
    return opt.meta?.[key]
}

/** True when the option satisfies the rule. Comparison is trimmed + case-insensitive. */
export function optionPassesRule(opt: ResolvedOption, rule: OptionFilterRule): boolean {
    const raw = readProp(opt, rule.field)
    const known = raw !== undefined && raw !== null
    const v = known ? norm(raw) : ''
    const notEquals = rule.notEquals ?? rule.not_equals
    const notIn = rule.notIn ?? rule.not_in
    // Positive rules need the property to exist; negative rules cannot exclude
    // what they cannot see, so an option lacking the property is kept.
    if (rule.equals !== undefined && !(known && v === norm(rule.equals))) return false
    if (Array.isArray(rule.in) && !(known && rule.in.some((x) => norm(x) === v))) return false
    if (notEquals !== undefined && known && v === norm(notEquals)) return false
    if (Array.isArray(notIn) && known && notIn.some((x) => norm(x) === v)) return false
    return true
}

/**
 * Applies the field's filter to resolved options. Returns the SAME array when
 * there is nothing to filter. `keepValue` (the current selection) is never
 * hidden, so an existing record keeps showing its label after the option
 * became ineligible.
 */
export function applyOptionFilter(
    options: ResolvedOption[],
    rules: OptionFilterRule[],
    keepValue?: unknown,
): ResolvedOption[] {
    if (rules.length === 0) return options
    const keep = keepValue === undefined || keepValue === null || keepValue === '' ? null : String(keepValue)
    return options.filter(
        (o) => (keep !== null && String(o.id) === keep) || rules.every((r) => optionPassesRule(o, r)),
    )
}
