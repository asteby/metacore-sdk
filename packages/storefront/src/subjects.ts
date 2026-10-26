// «My items» (contract 1.9): the pure side. The cascade of options a form shows, the same validation the server runs
// (the server is the authority; this gives the buyer the answer without a round trip), the compatibility key and the
// product tags it filters with. No UI, no storage, no copy, and no kind is named here: a kind is data the organization
// publishes (`content.subjectKinds()`), and what a field "means" (make, size, breed) is only its label.
//
// Privacy: a `private` field (a licence plate) is kept apart. It is never part of `label`, `fit_key` or any tag, and
// `maskedValue` / `isMasked` are how the server's mask is recognized so it is never sent back as if it were a value.

import type { SubjectCatalogNode, SubjectField, SubjectKind } from './types.js'

export const MIN_SUBJECT_YEAR = 1900
export const MAX_SUBJECT_YEAR = 2100
const MAX_VALUE_LENGTH = 80
const MAX_LABEL_LENGTH = 120
const MAX_FIT_KEY_LENGTH = 100

export type SubjectOption = { value: string; label: string }
export type SubjectValues = Record<string, string | number | null | undefined>

/** Why a value was refused (the server answers `422` with the field `attributes.<key>` and never the value). */
export type SubjectProblemCode = 'required' | 'unknown' | 'invalid' | 'not_in_catalog' | 'year_range' | 'catalog_unavailable'
export type SubjectProblems = Record<string, SubjectProblemCode>

export type ResolvedSubject = {
  /** Built from the labels of the catalog and the public values, in field order. */
  label: string
  /** `''` when a placeholder of the template has no value (the item then never matches a product). */
  fit_key: string
  /** Public values, as the server stores them in `attributes`. */
  attributes: Record<string, string | number>
  /** Private values: never in the label, the key or a tag. */
  private: Record<string, string>
}

const isPresent = (v: unknown): boolean => v !== null && v !== undefined && v !== ''

const asYear = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN
  return Number.isInteger(n) && n >= MIN_SUBJECT_YEAR && n <= MAX_SUBJECT_YEAR ? n : null
}

/** Collapses whitespace; `null` for a non-string, a control character or a value over `max` characters. */
const cleanText = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const s = v.split(/\s+/).filter(Boolean).join(' ')
  // eslint-disable-next-line no-control-regex
  return [...s].length > max || /[\u0000-\u001f\u007f-\u009f]/.test(s) ? null : s
}

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9._+-]+/g, '-').replace(/^-+|-+$/g, '')

/** Does the option cover the model year? Declared `ranges` win; else `from`/`to`; an option with none covers any year. */
export function coversYear(node: Pick<SubjectCatalogNode, 'from' | 'to' | 'ranges'>, year: number): boolean {
  if (node.ranges && node.ranges.length > 0) return node.ranges.some(([a, b]) => year >= a && year <= b)
  if (node.from !== undefined && year < node.from) return false
  if (node.to !== undefined && year > node.to) return false
  return true
}

const declaresYears = (n: SubjectCatalogNode): boolean => n.from !== undefined || n.to !== undefined || (n.ranges?.length ?? 0) > 0

/** The catalog fields that make the tree's levels, in order: `source: catalog` and not a year. */
export function subjectLevels(kind: Pick<SubjectKind, 'fields'>): SubjectField[] {
  return kind.fields.filter((f) => f.source === 'catalog' && f.type !== 'year')
}

/** The visible fields of a form: everything the buyer fills in, in the order of the kind. */
export function subjectFields(kind: Pick<SubjectKind, 'fields'>): SubjectField[] {
  return kind.fields
}

/** Walks the chosen values down the tree; stops at the first level without a (valid) choice. */
function walk(kind: SubjectKind, values: SubjectValues): { path: SubjectCatalogNode[]; ids: Record<string, string>; next: Record<string, SubjectCatalogNode> | undefined } {
  const path: SubjectCatalogNode[] = []
  const ids: Record<string, string> = {}
  let tree: Record<string, SubjectCatalogNode> | undefined = kind.catalog?.tree
  for (const f of subjectLevels(kind)) {
    const raw = values[f.key]
    const s = isPresent(raw) ? cleanText(raw, MAX_VALUE_LENGTH) : null
    const node: SubjectCatalogNode | undefined = s && tree ? (tree[s] ?? tree[s.toLowerCase()]) : undefined
    if (!s || !node) return { path, ids, next: tree }
    ids[f.key] = tree && tree[s] ? s : s.toLowerCase()
    path.push(node)
    tree = node.children
    if (!tree) return { path, ids, next: undefined }
  }
  return { path, ids, next: tree }
}

const byLabel = (a: SubjectOption, b: SubjectOption) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true })

/**
 * The options a catalog field offers given what is already chosen (a cascade: a level shows nothing until the previous
 * one is chosen). A level narrows by the chosen year when the option declares years; a year field offers the model
 * years the chosen options cover (newest first), or nothing when no option declares years (a free number then).
 */
export function subjectOptions(kind: SubjectKind, fieldKey: string, values: SubjectValues): SubjectOption[] {
  const field = kind.fields.find((f) => f.key === fieldKey)
  if (!field || field.source !== 'catalog' || !kind.catalog) return []
  if (field.type === 'year') {
    // Only the options chosen BEFORE the year constrain it (a stale choice after it is reconciled against the year).
    const upto = kind.fields.slice(0, kind.fields.indexOf(field))
    const { path } = walk({ ...kind, fields: upto }, values)
    const declared = path.filter(declaresYears)
    if (declared.length === 0) return []
    let lo = Infinity
    let hi = -Infinity
    for (const n of declared) {
      for (const [a, b] of n.ranges?.length ? n.ranges : [[n.from ?? MIN_SUBJECT_YEAR, n.to ?? MAX_SUBJECT_YEAR] as [number, number]]) {
        lo = Math.min(lo, a)
        hi = Math.max(hi, b)
      }
    }
    const out: SubjectOption[] = []
    for (let y = Math.min(hi, MAX_SUBJECT_YEAR); y >= Math.max(lo, MIN_SUBJECT_YEAR); y--) if (declared.every((n) => coversYear(n, y))) out.push({ value: String(y), label: String(y) })
    return out
  }
  const levels = subjectLevels(kind)
  const at = levels.findIndex((f) => f.key === fieldKey)
  if (at < 0) return []
  // Only the levels before this one must be chosen.
  const before = Object.fromEntries(levels.slice(0, at).map((f) => [f.key, values[f.key]]))
  const { path, next } = walk({ ...kind, fields: kind.fields.filter((f) => levels.slice(0, at).includes(f) || f.type === 'year') }, before)
  if (path.length < at || !next) return []
  const year = asYear(values[kind.fields.find((f) => f.type === 'year' && f.source === 'catalog')?.key ?? ''])
  return Object.entries(next)
    .filter(([, n]) => year === null || coversYear(n, year))
    .map(([value, n]) => ({ value, label: n.label }))
    .sort(byLabel)
}

/**
 * Drops what was chosen and is no longer valid after a change (a new make clears the model; a year the model does not
 * cover is cleared), in field order. Free values are never touched.
 */
export function reconcileSubjectValues(kind: SubjectKind, values: SubjectValues): SubjectValues {
  const out: SubjectValues = { ...values }
  for (const f of kind.fields) {
    if (f.source !== 'catalog' || !isPresent(out[f.key])) continue
    const options = subjectOptions(kind, f.key, out)
    const v = String(out[f.key])
    const ok = f.type === 'year' ? options.length === 0 || options.some((o) => o.value === v) : options.some((o) => o.value === v || o.value === v.toLowerCase())
    if (!ok) out[f.key] = ''
  }
  return out
}

/**
 * Validates and resolves the values the way the server does: unknown field, wrong type, a value missing from the
 * catalog and a year outside the chosen options' years are refused, naming the field only.
 */
export function resolveSubject(kind: SubjectKind, values: SubjectValues): { ok: true; subject: ResolvedSubject } | { ok: false; problems: SubjectProblems } {
  const problems: SubjectProblems = {}
  const known = new Set(kind.fields.map((f) => f.key))
  for (const key of Object.keys(values)) if (isPresent(values[key]) && !known.has(key)) problems[key] = 'unknown'

  const attributes: Record<string, string | number> = {}
  const priv: Record<string, string> = {}
  const display: Record<string, string> = {}
  const ids: Record<string, string> = {}
  const path: SubjectCatalogNode[] = []
  let tree: Record<string, SubjectCatalogNode> | undefined = kind.catalog?.tree
  const years: string[] = []
  const put = (f: SubjectField, v: string | number) => {
    if (f.private) priv[f.key] = String(v)
    else attributes[f.key] = v
  }
  for (const f of kind.fields) {
    const raw = values[f.key]
    if (!isPresent(raw)) {
      if (f.required) problems[f.key] = 'required'
      if (f.source === 'catalog' && f.type !== 'year') tree = undefined // a skipped level ends the walk
      continue
    }
    const max = f.max ?? MAX_VALUE_LENGTH
    if (f.type === 'year') {
      const y = asYear(raw)
      if (y === null) {
        problems[f.key] = 'invalid'
        continue
      }
      put(f, y)
      display[f.key] = ids[f.key] = String(y)
      if (f.source === 'catalog') years.push(f.key)
    } else if (f.source === 'catalog') {
      if (!kind.catalog) {
        problems[f.key] = 'catalog_unavailable'
        continue
      }
      const s = cleanText(raw, max)
      if (s === null) {
        problems[f.key] = 'invalid'
        continue
      }
      const node: SubjectCatalogNode | undefined = tree?.[s] ?? tree?.[s.toLowerCase()]
      if (!node) {
        problems[f.key] = 'not_in_catalog'
        continue
      }
      const id = tree?.[s] ? s : s.toLowerCase()
      path.push(node)
      tree = node.children
      put(f, id)
      display[f.key] = node.label
      ids[f.key] = id
    } else {
      const s = cleanText(raw, max)
      if (s === null) {
        problems[f.key] = 'invalid'
        continue
      }
      put(f, s)
      display[f.key] = s
      ids[f.key] = slug(s)
    }
  }
  for (const key of years) {
    const y = attributes[key] as number | undefined
    if (y !== undefined && !problems[key] && !path.every((n) => coversYear(n, y))) problems[key] = 'year_range'
  }
  if (Object.keys(problems).length > 0) return { ok: false, problems }

  const label = [...kind.fields.filter((f) => !f.private).map((f) => display[f.key]).filter(Boolean).join(' ')].slice(0, MAX_LABEL_LENGTH).join('').trim()
  if (!label) return { ok: false, problems: { _: 'required' } }
  let complete = true
  const key = kind.fit_key_template.replace(/\{([a-z][a-z0-9_]*)\}/g, (_m, name: string) => {
    const id = ids[name]
    if (!id) complete = false
    return id ?? ''
  })
  return { ok: true, subject: { label, fit_key: complete && key.length <= MAX_FIT_KEY_LENGTH ? key.toLowerCase() : '', attributes, private: priv } }
}

/** The mask the server puts in place of a private value («••34»). */
export const PRIVATE_MASK = '••'
export const isMasked = (v: unknown): boolean => typeof v === 'string' && v.startsWith(PRIVATE_MASK)

/** Prefix of the tag that publishes compatibility (`<prefix><fit_key>`), as in `FitmentConfig.tagPrefix`. */
export const DEFAULT_FIT_TAG_PREFIX = 'fit:'

/** The product tag that marks a part as fitting the item with this key. */
export const fitTag = (fitKey: string, prefix: string = DEFAULT_FIT_TAG_PREFIX): string => `${prefix}${fitKey}`

/**
 * The `tags_any` of a listing "only what fits my item": its own tag plus the universal one (`<prefix>universal`).
 * `[]` when the item has no key (it does not resolve completely): ask for nothing rather than for the wrong thing.
 */
export function fitTagsAny(fitKey: string | null | undefined, opts: { prefix?: string; universal?: boolean } = {}): string[] {
  if (!fitKey) return []
  const prefix = opts.prefix ?? DEFAULT_FIT_TAG_PREFIX
  return opts.universal === false ? [fitTag(fitKey, prefix)] : [fitTag(fitKey, prefix), `${prefix}universal`]
}
