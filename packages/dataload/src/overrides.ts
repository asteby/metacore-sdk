import { CLEAN_RULES, type CleanRule, type DataloadField, type DataloadOverrides, type DataloadProfile } from './types'

/**
 * Client-side mirror of the kernel rules for per-organization overrides
 * (profile.go `Profile.Resolve` + `Validate`, clean.go `validCleanRule`). It gives
 * immediate feedback in the editor; the server validates again on dry-run and save
 * and is the authority (e.g. Go RE2 regexes are only approximated with JS RegExp).
 */

export type OverrideSection = 'ignore' | 'rename' | 'clean_add' | 'values_add' | 'clean' | 'fields'

export type OverrideIssue =
  | { code: 'unknown_target'; section: OverrideSection; target: string }
  /** The kernel ignores it; reported as a warning so a typo does not go unnoticed. */
  | { code: 'unknown_drop'; target: string; warning: true }
  | { code: 'drop_key'; target: string }
  | { code: 'bad_rule'; section: OverrideSection; rule: string }
  | { code: 'bad_regex'; section: OverrideSection; rule: string }
  | { code: 'org_mismatch' }
  | { code: 'empty_header'; section: OverrideSection }
  | { code: 'empty_default' }

const KNOWN = new Set<string>(CLEAN_RULES)
const DROP_LINES = 'drop_lines:'

/** Go RE2 accepts a leading `(?i)` flag group that JS does not; translate it to test the expression. */
function jsRegex(src: string): RegExp {
  const ci = src.startsWith('(?i)')
  return new RegExp(ci ? src.slice(4) : src, ci ? 'i' : '')
}

export function cleanRuleIssue(rule: string, section: OverrideSection): OverrideIssue | null {
  if (rule.startsWith(DROP_LINES)) {
    const arg = rule.slice(DROP_LINES.length)
    if (!arg) return { code: 'bad_regex', section, rule }
    try {
      jsRegex(arg)
      return null
    } catch {
      return { code: 'bad_regex', section, rule }
    }
  }
  return KNOWN.has(rule) ? null : { code: 'bad_rule', section, rule }
}

const targetsOf = (fields: DataloadField[]) => new Set(fields.map((f) => f.target))

/** Problems of `o` over `profile`. Issues with `warning: true` do not block. */
export function validateOverrides(profile: DataloadProfile, o: DataloadOverrides | undefined, org?: string): OverrideIssue[] {
  if (!o) return []
  const out: OverrideIssue[] = []
  if (org && o.org && o.org !== org) out.push({ code: 'org_mismatch' })
  const all = targetsOf(profile.fields)
  const drop = new Set(o.drop ?? [])
  for (const t of drop) {
    if (!all.has(t)) out.push({ code: 'unknown_drop', target: t, warning: true })
    if (profile.key.includes(t) && !(o.fields ?? []).some((f) => f.target === t)) out.push({ code: 'drop_key', target: t })
  }
  // The kernel checks rename / cleanAdd / valuesAdd after dropping: touching a removed field is an error.
  const afterDrop = new Set([...all].filter((t) => !drop.has(t)))
  const check = (section: OverrideSection, m: Record<string, unknown> | undefined) => {
    for (const t of Object.keys(m ?? {})) if (!afterDrop.has(t)) out.push({ code: 'unknown_target', section, target: t })
  }
  check('rename', o.rename)
  check('clean_add', o.cleanAdd)
  check('values_add', o.valuesAdd)

  for (const hs of Object.values(o.rename ?? {})) if (hs.some((h) => !h.trim())) out.push({ code: 'empty_header', section: 'rename' })
  if ((o.ignoreHeaders ?? []).some((h) => !h.trim())) out.push({ code: 'empty_header', section: 'ignore' })
  if (Object.keys(o.defaults ?? {}).some((k) => !k.trim())) out.push({ code: 'empty_default' })

  const rules: [OverrideSection, string][] = [
    ...(o.clean ?? profile.clean ?? []).map((r) => ['clean', r] as [OverrideSection, string]),
    ...Object.values(o.cleanAdd ?? {}).flat().map((r) => ['clean_add', r] as [OverrideSection, string]),
  ]
  for (const [section, r] of rules) {
    const issue = cleanRuleIssue(r, section)
    if (issue) out.push(issue)
  }
  return out
}

export const blockingIssues = (issues: OverrideIssue[]) => issues.filter((i) => !('warning' in i && i.warning))

/** Same result as `Profile.Resolve` in the kernel (without its validation). Never mutates `profile`. */
export function resolveProfile(profile: DataloadProfile, o: DataloadOverrides | undefined): DataloadProfile {
  const out: DataloadProfile = {
    ...profile,
    fields: [...profile.fields],
    ignoreHeaders: [...(profile.ignoreHeaders ?? [])],
    defaults: { ...(profile.defaults ?? {}) },
  }
  if (!o) return out
  out.ignoreHeaders = [...out.ignoreHeaders!, ...(o.ignoreHeaders ?? [])]
  out.defaults = { ...out.defaults, ...(o.defaults ?? {}) }
  if (o.clean) out.clean = o.clean
  const drop = new Set(o.drop ?? [])
  out.fields = out.fields
    .filter((f) => !drop.has(f.target))
    .map((f) => {
      const n = { ...f }
      const extra = o.rename?.[f.target]
      if (extra) n.from = [...f.from, ...extra]
      const cleanAdd = o.cleanAdd?.[f.target]
      if (cleanAdd) n.clean = [...(f.clean ?? []), ...cleanAdd]
      const values = o.valuesAdd?.[f.target]
      if (values) n.values = { ...(f.values ?? {}), ...values }
      return n
    })
  for (const nf of o.fields ?? []) {
    const i = out.fields.findIndex((f) => f.target === nf.target)
    if (i >= 0) out.fields[i] = nf
    else out.fields.push(nf)
  }
  return out
}

/** Drops empty parts so the overrides sent (and hashed by the kernel) only carry what changes. */
export function compactOverrides(o: DataloadOverrides): DataloadOverrides | undefined {
  const out: DataloadOverrides = {}
  if (o.org) out.org = o.org
  const list = (v?: string[]) => (v ?? []).map((s) => s.trim()).filter(Boolean)
  const ignore = list(o.ignoreHeaders)
  if (ignore.length) out.ignoreHeaders = ignore
  const nonEmpty = <T>(m: Record<string, T[]>) => Object.fromEntries(Object.entries(m).filter(([, v]) => v.length > 0))
  const rename = nonEmpty(Object.fromEntries(Object.entries(o.rename ?? {}).map(([k, v]) => [k, list(v)])))
  if (Object.keys(rename).length) out.rename = rename
  if (o.fields?.length) out.fields = o.fields
  const drop = list(o.drop)
  if (drop.length) out.drop = drop
  const defaults = Object.fromEntries(Object.entries(o.defaults ?? {}).filter(([k]) => k.trim()))
  if (Object.keys(defaults).length) out.defaults = defaults
  if (o.clean) out.clean = o.clean
  const cleanAdd = nonEmpty(Object.fromEntries(Object.entries(o.cleanAdd ?? {}).map(([k, v]) => [k, list(v) as CleanRule[]])))
  if (Object.keys(cleanAdd).length) out.cleanAdd = cleanAdd
  const valuesAdd = Object.fromEntries(Object.entries(o.valuesAdd ?? {}).filter(([, v]) => Object.keys(v).length))
  if (Object.keys(valuesAdd).length) out.valuesAdd = valuesAdd
  return Object.keys(out).filter((k) => k !== 'org').length ? out : undefined
}

/** Splits "a, b ,c" (or one per line) into trimmed, non-empty parts. */
export function splitList(s: string, sep: RegExp = /[,\n]/): string[] {
  return s.split(sep).map((x) => x.trim()).filter(Boolean)
}

/** Reads a default typed by the field: numbers and booleans as such, everything else as text. */
export function parseDefault(raw: string, field?: DataloadField): unknown {
  const v = raw.trim()
  if (field?.type === 'number' && v !== '' && Number.isFinite(Number(v))) return Number(v)
  if (field?.type === 'boolean' && (v === 'true' || v === 'false')) return v === 'true'
  return raw
}
