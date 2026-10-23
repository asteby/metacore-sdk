import type { IdentityDocumentSpec, IdentityRulesV1, IdentityStrategy, RegionFiscalId } from '../types.js'
import { getIdentityExtractor } from './registry.js'
import { ageInDays, foldText } from './text.js'
import type { EvidenceInput, ExtractOptions, ExtractedValue, FiscalDocumentEvidence, IdentityCatalogs, IdentityExtraction } from './types.js'

/** Longest text the engine reads (a one-page document is a few thousand characters). */
export const MAX_TEXT_LENGTH = 400_000

const MAX_FIELDS = 32
const MAX_STRATEGIES = 8
const MAX_PATTERN = 1024
const STRATEGIES = new Set(['regex', 'labeled_lines', 'concat_labeled', 'catalog_phrases', 'date', 'qr_param'])
const STRATEGY_KEYS = new Set([
  'strategy', 'pattern', 'flags', 'group', 'label', 'labels', 'separator', 'catalog', 'start', 'end', 'order', 'months',
  'param', 'split', 'parts', 'match', 'upper', 'capture',
])

/** Thrown for a spec that cannot run (unknown engine, rules that do not validate, no extractor registered). */
export class IdentityRulesError extends Error {
  override readonly name = 'IdentityRulesError'
}

// ---- regular expressions ---------------------------------------------------

const cache = new Map<string, RegExp>()

function checkPattern(what: string, p: string | undefined, flags = ''): void {
  if (!p) throw new IdentityRulesError(`rules: ${what}: empty pattern`)
  if (p.length > MAX_PATTERN) throw new IdentityRulesError(`rules: ${what}: pattern longer than ${MAX_PATTERN}`)
  for (const f of flags) if (f !== 'i' && f !== 's' && f !== 'm') throw new IdentityRulesError(`rules: ${what}: unknown flag "${f}"`)
  if (p.replaceAll('(?:', '').includes('(?')) throw new IdentityRulesError(`rules: ${what}: only (?: groups are portable`)
  for (const bad of ['[[:', '\\p', '\\P', '\\z', '\\A', '\\Q', '\\E', '\\C']) {
    if (p.includes(bad)) throw new IdentityRulesError(`rules: ${what}: ${bad} is not portable`)
  }
  try {
    compiled(p, flags)
  } catch (err) {
    throw err instanceof IdentityRulesError ? err : new IdentityRulesError(`rules: ${what}: invalid pattern`)
  }
}

function compiled(p: string, flags = '', global = false): RegExp {
  const k = `${global ? 'g' : ''}${flags}/${p}`
  let re = cache.get(k)
  if (!re) {
    re = new RegExp(p, flags + (global ? 'g' : ''))
    cache.set(k, re)
  }
  re.lastIndex = 0
  return re
}

// ---- validation (same checks as the reference interpreter) ------------------

function validateStrategy(s: IdentityStrategy, haveLabels: boolean): void {
  for (const k of Object.keys(s)) if (!STRATEGY_KEYS.has(k)) throw new IdentityRulesError(`rules: unknown member "${k}"`)
  if (s.capture) {
    checkPattern('capture', s.capture.pattern, s.capture.flags)
    const groups = new RegExp(s.capture.pattern + '|').exec('')!.length - 1
    if ((s.capture.group ?? 0) < 0 || (s.capture.group ?? 0) > groups) throw new IdentityRulesError('rules: capture group does not exist')
  }
  switch (s.strategy) {
    case 'regex': {
      checkPattern('pattern', s.pattern, s.flags)
      const groups = new RegExp(s.pattern + '|').exec('')!.length - 1
      if ((s.group ?? 0) < 0 || (s.group ?? 0) > groups) throw new IdentityRulesError('rules: regex group does not exist')
      return
    }
    case 'labeled_lines':
      if (!haveLabels) throw new IdentityRulesError('rules: labeled_lines needs the top-level labels list')
      return checkPattern('label', s.label)
    case 'concat_labeled':
      if (!haveLabels || !s.labels?.length) throw new IdentityRulesError('rules: concat_labeled needs labels')
      return s.labels.forEach((l) => checkPattern('labels', l))
    case 'catalog_phrases':
      if (!s.catalog) throw new IdentityRulesError('rules: catalog_phrases needs a catalog')
      return [s.start, s.end].forEach((p) => p && checkPattern('section', p, 'i'))
    case 'date': {
      checkPattern('pattern', s.pattern, s.flags)
      const order = s.order ?? ''
      if (order.length !== 3 || ![...'dmy'].every((c) => order.split(c).length === 2)) throw new IdentityRulesError(`rules: date order "${order}" must be a permutation of d, m, y`)
      if (new RegExp(s.pattern + '|').exec('')!.length - 1 < 3) throw new IdentityRulesError('rules: date pattern needs three groups')
      if (s.months && s.months.length !== 0 && s.months.length !== 12) throw new IdentityRulesError('rules: date months wants 12 names')
      return
    }
    case 'qr_param':
      if (!s.param) throw new IdentityRulesError('rules: qr_param needs a param')
      if ((s.parts ?? 0) < 0) throw new IdentityRulesError('rules: qr_param parts must not be negative')
      return checkPattern('match', s.match)
    default:
      throw new IdentityRulesError(`rules: unknown strategy "${String(s.strategy)}"`)
  }
}

/** Checks rules are well formed and portable; no rule may produce a `discard` field. Throws `IdentityRulesError`. */
export function validateRules(rules: IdentityRulesV1, discard: string[] = []): void {
  if (rules?.version !== 1) throw new IdentityRulesError(`rules: version ${String(rules?.version)} is not 1`)
  for (const n of rules.normalize ?? []) if (n !== 'nbsp' && n !== 'collapse_ws') throw new IdentityRulesError(`rules: unknown normalize step "${String(n)}"`)
  for (const l of rules.labels ?? []) checkPattern('labels', l)
  if (!Array.isArray(rules.fields) || rules.fields.length === 0 || rules.fields.length > MAX_FIELDS) throw new IdentityRulesError(`rules: want 1..${MAX_FIELDS} fields`)
  const drop = new Set(discard.map((d) => d.trim().toLowerCase()))
  const seen = new Set<string>()
  for (const f of rules.fields) {
    if (!f.key || seen.has(f.key)) throw new IdentityRulesError(`rules: field key "${f.key}" is empty or repeated`)
    seen.add(f.key)
    if (drop.has(f.key.toLowerCase())) throw new IdentityRulesError(`rules: field "${f.key}" is in discard_fields`)
    if (!Array.isArray(f.strategies) || f.strategies.length === 0 || f.strategies.length > MAX_STRATEGIES) throw new IdentityRulesError(`rules: field "${f.key}" wants 1..${MAX_STRATEGIES} strategies`)
    for (const s of f.strategies) {
      if (!STRATEGIES.has(s.strategy)) throw new IdentityRulesError(`rules: unknown strategy "${String(s.strategy)}"`)
      validateStrategy(s, (rules.labels?.length ?? 0) > 0)
    }
  }
}

function parseRules(spec: IdentityDocumentSpec): IdentityRulesV1 {
  let rules = spec.rules
  if (typeof rules === 'string') {
    try {
      rules = JSON.parse(rules) as IdentityRulesV1
    } catch {
      throw new IdentityRulesError(`${spec.kind}: rules is not valid JSON`)
    }
  }
  if (!rules || typeof rules !== 'object') throw new IdentityRulesError(`${spec.kind}: rules@1 needs rules`)
  validateRules(rules, spec.discard_fields ?? [])
  return rules
}

// ---- interpreter (mirrors the reference ExtractIdentity) --------------------

function normalizeText(s: string, steps: string[] = []): string {
  let t = s.length > MAX_TEXT_LENGTH ? s.slice(0, MAX_TEXT_LENGTH) : s
  for (const st of steps) {
    if (st === 'nbsp') t = t.replaceAll(' ', ' ')
    else if (st === 'collapse_ws') t = t.split(/\s+/).filter(Boolean).join(' ')
  }
  return t
}

type LabelHit = { caption: string; start: number; from: number }

class LabelIndex {
  private readonly hits: LabelHit[] = []
  constructor(
    labels: string[],
    private readonly text: string,
  ) {
    if (labels.length === 0) return
    for (const m of text.matchAll(new RegExp(`(?:^|\\s)(${labels.join('|')})\\s*:`, 'gi'))) {
      this.hits.push({ caption: m[1] ?? '', start: m.index, from: m.index + m[0].length })
    }
  }

  value(label: string): string {
    const full = compiled(`^(?:${label})$`, 'i')
    for (let i = 0; i < this.hits.length; i++) {
      const h = this.hits[i]!
      if (!full.test(h.caption)) continue
      const end = i + 1 < this.hits.length ? this.hits[i + 1]!.start : this.text.length
      return this.text.slice(h.from, end).trim()
    }
    return ''
  }
}

function section(text: string, start?: string, end?: string): string {
  let from = 0
  if (start) {
    const m = compiled(start, 'is').exec(text)
    if (!m) return ''
    from = m.index + m[0].length
  }
  let to = text.length
  if (end) {
    const m = compiled(end, 'is').exec(text.slice(from))
    if (m) to = from + m.index
  }
  return text.slice(from, to)
}

function phrasesOf(e: { label: string; match_phrases?: string[] }): string[] {
  const src = e.match_phrases?.length ? e.match_phrases : [e.label]
  return [...new Set(src.map(foldText).filter(Boolean))]
}

function catalogHits(sec: string, entries: IdentityCatalogs[string] = []): string[] {
  const hay = foldText(sec)
  const hits: { code: string; at: number }[] = []
  for (const e of entries) {
    let best = -1
    for (const p of phrasesOf(e)) {
      const at = hay.indexOf(p)
      if (at >= 0 && (best < 0 || at < best)) best = at
    }
    if (best >= 0) hits.push({ code: e.code, at: best })
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.code)
}

function parseDate(text: string, s: IdentityStrategy): string {
  const m = compiled(s.pattern!, s.flags ?? '').exec(text)
  if (!m) return ''
  let d = 0
  let mo = 0
  let y = 0
  for (let i = 0; i < 3; i++) {
    const c = s.order![i]
    const g = (m[i + 1] ?? '').trim()
    let n = /^[+-]?\d+$/.test(g) ? Number(g) : NaN
    if (Number.isNaN(n) && c === 'm' && s.months?.length === 12) {
      n = 0
      s.months.forEach((name, j) => {
        if (foldText(name) === foldText(g)) n = j + 1
      })
    }
    if (Number.isNaN(n) || n === 0) return ''
    if (c === 'd') d = n
    else if (c === 'm') mo = n
    else y = n
  }
  const t = new Date(Date.UTC(y, mo - 1, d))
  if (y < 1000 || t.getUTCFullYear() !== y || t.getUTCMonth() + 1 !== mo || t.getUTCDate() !== d) return ''
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function qrPart(qr: string, s: IdentityStrategy): string {
  const url = qr.trim()
  if (!url) return ''
  const m = new RegExp(`[?&]${s.param!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^&\\s#]+)`, 'i').exec(url)
  if (!m) return ''
  let val: string
  try {
    val = decodeURIComponent(m[1]!.replaceAll('+', ' '))
  } catch {
    return ''
  }
  const parts = s.split ? val.split(s.split) : [val]
  if ((s.parts ?? 0) > 0 && parts.length !== s.parts) return ''
  const re = compiled(s.match!)
  for (const raw of parts) {
    const p = raw.trim().toUpperCase()
    if (re.test(p)) return p
  }
  return ''
}

function post(s: IdentityStrategy, value: string): string {
  let v = value.trim()
  if (!v) return ''
  if (s.upper) v = v.toUpperCase()
  if (s.capture) {
    const m = compiled(s.capture.pattern, s.capture.flags ?? '').exec(v)
    if (!m) return ''
    v = (m[s.capture.group ?? 0] ?? '').trim()
  }
  return v
}

function run(s: IdentityStrategy, text: string, labels: LabelIndex, catalogs: IdentityCatalogs): string[] {
  switch (s.strategy) {
    case 'regex': {
      const m = compiled(s.pattern!, s.flags ?? '').exec(text)
      return m ? [m[s.group ?? 0] ?? ''] : []
    }
    case 'labeled_lines':
      return [labels.value(s.label!)]
    case 'concat_labeled': {
      const parts = (s.labels ?? []).map((l) => labels.value(l).trim()).filter(Boolean)
      return [parts.join(s.separator || ' ')]
    }
    case 'catalog_phrases':
      return catalogHits(section(text, s.start, s.end), catalogs[s.catalog!])
    case 'date':
      return [parseDate(text, s)]
    default:
      return []
  }
}

const nonEmpty = (vals: string[]) => vals.map((v) => v.trim()).filter(Boolean)

/**
 * Reads an identity document (the text of a PDF, `readPdfText`) with the rules of its spec: the TypeScript twin of
 * the reference interpreter of the region packs. Generic, the country is data. `discard_fields` never appear in
 * the output. Pure and synchronous; a text that does not match yields `missing`, never an exception; only a spec
 * that cannot run throws `IdentityRulesError`.
 */
export function extractIdentityDocument(text: string, spec: IdentityDocumentSpec, options: ExtractOptions = {}): IdentityExtraction {
  const discard = (spec.discard_fields ?? []).map((d) => d.trim().toLowerCase())
  const out: IdentityExtraction = {
    kind: spec.kind,
    extractor: spec.engine,
    fields: {},
    sources: {},
    missing: [],
    discarded: [...(spec.discard_fields ?? [])],
    qr: { match: null },
    stale: null,
    age_days: null,
  }

  if (spec.engine === 'rules@1') {
    const rules = parseRules(spec)
    const body = normalizeText(text, rules.normalize)
    const labels = new LabelIndex(rules.labels ?? [], body)
    const catalogs = options.catalogs ?? {}
    let compared = 0
    let equal = 0
    for (const f of rules.fields) {
      let textVals: string[] = []
      const qrVals: string[] = []
      for (const s of f.strategies) {
        if (s.strategy === 'qr_param') {
          const v = post(s, qrPart(options.qr ?? '', s))
          if (v) qrVals.push(v)
          continue
        }
        if (textVals.length > 0) continue
        textVals = nonEmpty(run(s, body, labels, catalogs).map((v) => post(s, v)))
      }
      let got: string[] = []
      if (textVals.length > 0) {
        got = textVals
        out.sources[f.key] = 'text'
      } else if (qrVals.length > 0) {
        got = qrVals.slice(0, 1)
        out.sources[f.key] = 'qr'
      }
      if (textVals.length > 0 && qrVals.length > 0) {
        compared++
        if (textVals[0]!.toUpperCase() === qrVals[0]!.toUpperCase()) equal++
      }
      if (got.length === 0) {
        if (f.required) out.missing.push(f.key)
      } else out.fields[f.key] = f.multiple ? got : got[0]!
    }
    if (compared > 0) out.qr.match = compared === equal
  } else {
    const id = spec.engine.startsWith('plugin:') ? spec.engine.slice('plugin:'.length) : spec.engine
    const fn = getIdentityExtractor(id) ?? getIdentityExtractor(spec.kind)
    if (!fn) throw new IdentityRulesError(`${spec.kind}: no extractor registered for engine "${spec.engine}"`)
    const res = fn(text, spec, options)
    out.fields = { ...res.fields }
    out.sources = { ...(res.sources ?? {}) }
    out.missing = [...(res.missing ?? [])]
    out.qr.match = res.qr_match ?? null
  }

  // The spec's discard list wins over any engine, plugins included.
  for (const k of Object.keys(out.fields)) {
    if (discard.includes(k.toLowerCase())) {
      delete out.fields[k]
      delete out.sources[k]
    }
  }

  const issued = out.fields.issued_on
  if (typeof issued === 'string') {
    out.age_days = ageInDays(issued, options.now ?? new Date())
    if (spec.freshness_days && out.age_days !== null) out.stale = out.age_days > spec.freshness_days
  }
  return out
}

/** The catalogs `catalog_phrases` rules name, from the region: `fiscal_regime` and `invoice_use`. */
export function catalogsFromRegion(fiscalId: Pick<RegionFiscalId, 'regimes' | 'invoice_uses'>): IdentityCatalogs {
  return { fiscal_regime: fiscalId.regimes, invoice_use: fiscalId.invoice_uses }
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

export type { ExtractedValue }
