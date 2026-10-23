import type { IdentityDocumentSpec, IdentityFieldRule, IdentityQrRule, IdentityRulesV1, IdentityTransform } from '../types.js'
import { getIdentityExtractor } from './registry.js'
import { ageInDays, findDate, foldAligned, foldText, squash, stripMarks } from './text.js'
import type { EvidenceInput, ExtractOptions, ExtractedValue, FiscalDocumentEvidence, IdentityCatalogs, IdentityExtraction } from './types.js'

/** Longest text the engine reads (a one-page document is a few thousand characters). */
export const MAX_TEXT_LENGTH = 400_000
const MAX_PATTERN_LENGTH = 2000
const MAX_VALUE_LENGTH = 400

/** Thrown for a spec that cannot be run (unknown engine, unparseable rules, no extractor registered). */
export class IdentityRulesError extends Error {
  override readonly name = 'IdentityRulesError'
}

type Rule = IdentityFieldRule | { first_of: IdentityFieldRule[] }

function parseRules(spec: IdentityDocumentSpec): IdentityRulesV1 {
  let rules = spec.rules
  if (typeof rules === 'string') {
    try {
      rules = JSON.parse(rules) as IdentityRulesV1
    } catch {
      throw new IdentityRulesError(`${spec.kind}: rules is not valid JSON`)
    }
  }
  if (!rules || typeof rules !== 'object' || !rules.fields || typeof rules.fields !== 'object') {
    throw new IdentityRulesError(`${spec.kind}: rules@1 needs a "fields" object`)
  }
  return rules
}

class Matcher {
  /** Text with every whitespace run as one space; original characters. */
  readonly flat: string
  /** Same length as `flat`, accent-less lowercase (or `flat` itself when `fold` is off). */
  readonly hay: string
  private readonly labelAlt: string

  constructor(
    text: string,
    private readonly rules: IdentityRulesV1,
    readonly catalogs: IdentityCatalogs,
  ) {
    this.flat = squash(text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text)
    this.hay = rules.fold === false ? this.flat : foldAligned(this.flat)
    this.labelAlt = (rules.labels ?? []).map((l) => `(?:${this.prep(l)})`).join('|')
  }

  /** Folds a pattern source the same way as the text, so authors write accent-less rules. */
  prep(source: string): string {
    return this.rules.fold === false ? source : stripMarks(source)
  }

  /** A value in the form the patterns are written for (accent-less when `fold`). */
  norm(value: string): string {
    return this.rules.fold === false ? value : foldAligned(value)
  }

  /** Compiles a rule pattern; `null` for one that is too long or invalid (the field is then missing). */
  re(source: string, flags = 'i', extra = ''): RegExp | null {
    if (source.length > MAX_PATTERN_LENGTH) return null
    try {
      return new RegExp(extra + this.prep(source), flags.includes('i') ? flags : flags + 'i')
    } catch {
      return null
    }
  }

  /** `[from, to)` of the text a rule looks at. */
  scope(scope?: { start: string; end?: string }): [number, number] {
    if (!scope) return [0, this.hay.length]
    const start = this.re(scope.start)
    const m = start?.exec(this.hay)
    if (!m) return [0, 0]
    const from = m.index + m[0].length
    if (!scope.end) return [from, this.hay.length]
    const end = this.re(scope.end)
    const rest = end ? this.hay.slice(from).search(end) : -1
    return [from, rest < 0 ? this.hay.length : from + rest]
  }

  /** Value after `label:` up to the next known label (or the end). */
  labeled(label: string, [from, to]: [number, number]): string {
    const lab = this.re(label)
    if (!lab) return ''
    const win = this.hay.slice(from, to)
    const m = new RegExp(`(?:^|\\s)(?:${lab.source})\\s*:\\s*`, lab.flags.replace('g', '')).exec(win)
    if (!m) return ''
    const start = m.index + m[0].length
    let end = win.length
    if (this.labelAlt) {
      const next = new RegExp(`(?:^|\\s)(?:${this.labelAlt})\\s*:`, 'i').exec(win.slice(start))
      if (next) end = start + next.index
    }
    return this.flat.slice(from + start, from + end).trim()
  }
}

const TRANSFORMS: Record<IdentityTransform, (v: string) => string> = {
  upper: (v) => v.toUpperCase(),
  lower: (v) => v.toLowerCase(),
  trim: (v) => v.trim(),
  digits: (v) => v.replace(/\D+/g, ''),
  alnum: (v) => v.replace(/[^\p{L}\p{N}]+/gu, ''),
}

function finish(m: Matcher, value: string, rule: { transform?: IdentityTransform[]; accept?: string }): string {
  let v = value.trim()
  for (const t of rule.transform ?? []) v = TRANSFORMS[t]?.(v) ?? v
  v = v.trim().slice(0, MAX_VALUE_LENGTH)
  if (v && rule.accept) {
    const ok = m.re(rule.accept)
    if (!ok || !ok.test(m.norm(v))) return ''
  }
  return v
}

function phrasesOf(entry: { code: string; label: string; match_phrases?: string[] }): string[] {
  const own = entry.match_phrases?.filter((p) => typeof p === 'string' && p.trim()) ?? []
  return (own.length ? own : [entry.label]).map(foldText).filter(Boolean)
}

/** Catalog codes whose phrases occur in the scope, in order of appearance. Longest phrases first; no overlaps. */
function catalogCodes(m: Matcher, rule: Extract<IdentityFieldRule, { strategy: 'catalog_phrases' }>): string[] {
  const entries = m.catalogs[rule.catalog] ?? []
  const [from, to] = m.scope(rule.scope)
  const chars = foldAligned(m.flat.slice(from, to)).split('')
  const hits: { at: number; code: string }[] = []
  const all = entries.flatMap((e) => phrasesOf(e).map((p) => ({ code: e.code, p })))
  all.sort((a, b) => b.p.length - a.p.length)
  for (const { code, p } of all) {
    const hay = chars.join('')
    let i = hay.indexOf(p)
    while (i >= 0) {
      if (!hits.some((h) => h.code === code)) hits.push({ at: i, code })
      for (let k = i; k < i + p.length; k++) chars[k] = '\u0000'
      i = chars.join('').indexOf(p, i + p.length)
    }
  }
  const codes = hits.sort((a, b) => a.at - b.at).map((h) => h.code)
  return rule.multi === false ? codes.slice(0, 1) : codes
}

function readOne(m: Matcher, rule: IdentityFieldRule): ExtractedValue {
  const range = m.scope(rule.scope)
  switch (rule.strategy) {
    case 'regex': {
      const re = m.re(rule.pattern, (rule.flags ?? 'i').replace(/[dg]/g, '') + 'd')
      if (!re) return ''
      const hit = re.exec(m.hay.slice(range[0], range[1])) as (RegExpExecArray & { indices?: [number, number][] }) | null
      const span = hit?.indices?.[rule.group ?? (hit.length > 1 ? 1 : 0)]
      if (!span) return ''
      return finish(m, m.flat.slice(range[0] + span[0], range[0] + span[1]), rule)
    }
    case 'labeled_lines':
      return finish(m, m.labeled(rule.label, range), rule)
    case 'concat_labeled': {
      const parts = rule.labels.map((l) => finish(m, m.labeled(l, range), { transform: ['trim'] })).filter(Boolean)
      return finish(m, parts.join(rule.join ?? ' '), rule)
    }
    case 'catalog_phrases':
      return catalogCodes(m, rule)
    case 'date': {
      const region = rule.label ? m.labeled(rule.label, range) : m.flat.slice(range[0], range[1])
      return findDate(foldAligned(region), rule.order ?? 'dmy') ?? ''
    }
    default:
      return ''
  }
}

function readField(m: Matcher, rule: Rule): ExtractedValue {
  const options = 'first_of' in rule ? rule.first_of : [rule]
  for (const r of options) {
    const v = readOne(m, r)
    if (Array.isArray(v) ? v.length > 0 : v !== '') return v
  }
  return ''
}

/** Reads the QR text of a document into fields. A value that is not a URL with the parameter yields nothing. */
function readQr(qr: string, rules: IdentityRulesV1, m: Matcher): Record<string, string> {
  const out: Record<string, string> = {}
  const text = qr.trim().slice(0, 2048)
  if (!text) return out
  const fields = rules.qr?.fields ?? {}
  for (const [name, rule] of Object.entries(fields) as [string, IdentityQrRule][]) {
    let raw = ''
    try {
      raw = new URL(text).searchParams.get(rule.param) ?? ''
    } catch {
      raw = new RegExp(`[?&]${rule.param.replace(/[^\w-]/g, '')}=([^&\\s]+)`, 'i').exec(text)?.[1] ?? ''
      try {
        raw = decodeURIComponent(raw)
      } catch {
        /* keep the raw value */
      }
    }
    if (!raw) continue
    const accept = m.re(rule.accept)
    if (!accept) continue
    for (const part of raw.split(rule.separator ?? '_')) {
      const v = finish(m, part, { transform: rule.transform ?? ['trim', 'upper'] })
      if (v && accept.test(m.norm(v))) {
        out[name] = v
        break
      }
    }
  }
  return out
}

/** Removes `needle` (case-insensitive) from every string value of `fields` so a discarded datum never leaks through another field. */
function scrub(fields: Record<string, ExtractedValue>, secrets: string[]): void {
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v !== 'string') continue
    let out = v
    for (const s of secrets) {
      if (s.length >= 4) out = out.split(s).join('').replace(/\s{2,}/g, ' ').trim()
    }
    if (out !== v) fields[k] = out
  }
}

/**
 * Reads an identity document (the text of a PDF, `readPdfText`) with the rules of its spec. Generic: the
 * country is data. `discard_fields` never appear in the output. Pure and synchronous; never throws on a text
 * that does not match (the fields are `missing`), only on a spec that cannot run (`IdentityRulesError`).
 */
export function extractIdentityDocument(text: string, spec: IdentityDocumentSpec, options: ExtractOptions = {}): IdentityExtraction {
  const discard = new Set((spec.discard_fields ?? []).map((f) => f.toLowerCase()))
  const base: IdentityExtraction = {
    kind: spec.kind,
    extractor: spec.engine,
    fields: {},
    missing: [],
    discarded: [],
    qr: { fields: {}, match: null, mismatched: [] },
    stale: null,
    age_days: null,
  }
  const secrets: string[] = []
  let fields: Record<string, ExtractedValue> = {}

  const isRules = spec.engine === 'rules@1'
  if (!isRules) {
    const id = spec.engine.startsWith('plugin:') ? spec.engine.slice('plugin:'.length) : spec.engine
    const fn = getIdentityExtractor(id) ?? getIdentityExtractor(spec.kind)
    if (!fn) throw new IdentityRulesError(`${spec.kind}: no extractor registered for engine "${spec.engine}"`)
    const res = fn(text, spec, options)
    fields = { ...res.fields }
    base.qr.fields = { ...(res.qr ?? {}) }
  } else {
    const rules = parseRules(spec)
    const m = new Matcher(text, rules, options.catalogs ?? {})
    for (const [name, rule] of Object.entries(rules.fields)) {
      const v = readField(m, rule)
      const empty = Array.isArray(v) ? v.length === 0 : v === ''
      if (discard.has(name.toLowerCase())) {
        if (typeof v === 'string' && v) secrets.push(v)
        continue
      }
      if (empty) base.missing.push(name)
      else fields[name] = v
    }
    if (options.qr) base.qr.fields = readQr(options.qr, rules, m)
    const compare = rules.qr?.compare ?? Object.keys(base.qr.fields)
    const mismatched = compare.filter((f) => {
      const a = base.qr.fields[f]
      const b = fields[f]
      return a !== undefined && typeof b === 'string' && a.toUpperCase() !== b.toUpperCase()
    })
    const comparable = compare.filter((f) => base.qr.fields[f] !== undefined && typeof fields[f] === 'string')
    base.qr.mismatched = mismatched
    base.qr.match = options.qr ? (comparable.length > 0 ? mismatched.length === 0 : null) : null
  }

  // The spec's discard list wins over any engine, plugins included.
  for (const name of Object.keys(fields)) {
    if (discard.has(name.toLowerCase())) {
      const dropped = fields[name]
      if (typeof dropped === 'string' && dropped) secrets.push(dropped)
      delete fields[name]
    }
  }
  for (const name of Object.keys(base.qr.fields)) if (discard.has(name.toLowerCase())) delete base.qr.fields[name]
  if (secrets.length) scrub(fields, secrets)
  base.fields = fields
  base.discarded = [...discard]

  if (!isRules) {
    // A plugin that reads the QR itself reports `qr`; compare the same way.
    const compare = Object.keys(base.qr.fields).filter((f) => typeof fields[f] === 'string')
    if (compare.length) {
      base.qr.mismatched = compare.filter((f) => String(fields[f]).toUpperCase() !== base.qr.fields[f]!.toUpperCase())
      base.qr.match = base.qr.mismatched.length === 0
    }
  }

  const issued = fields.issued_on
  if (typeof issued === 'string' && spec.freshness_days) {
    const age = ageInDays(issued, options.now ?? new Date())
    base.age_days = age
    base.stale = age === null ? null : age > spec.freshness_days
  } else if (typeof issued === 'string') {
    base.age_days = ageInDays(issued, options.now ?? new Date())
  }
  return base
}

/**
 * The evidence to send with the fiscal data (`InvoiceRequest.document`): where it came from and nothing of the
 * document. `source` is `pdf_client` in the browser, `pdf_server` when a server read it, `manual` for typed data.
 */
export function buildDocumentEvidence(extraction: IdentityExtraction, input: EvidenceInput): FiscalDocumentEvidence {
  const id = extraction.fields.document_id
  const issued = extraction.fields.issued_on
  return {
    kind: extraction.kind,
    document_id: typeof id === 'string' ? id : null,
    issued_on: typeof issued === 'string' ? issued : null,
    sha256: input.sha256 ?? null,
    extractor: extraction.extractor,
    source: input.source,
    qr_match: extraction.qr.match,
  }
}
