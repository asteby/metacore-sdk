import type { IngestTarget } from './types'

// Pure helpers for the TargetPicker and the inbound mapping editor.

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export interface TargetGroup {
  addon: string
  addonName: string
  targets: IngestTarget[]
}

/** Groups targets by addon (sorted), filtering by a case/accent-insensitive query. */
export function groupTargets(targets: IngestTarget[], query: string): TargetGroup[] {
  const q = norm(query.trim())
  const groups = new Map<string, TargetGroup>()
  for (const tg of targets) {
    if (q && !norm(`${tg.model} ${tg.label ?? ''} ${tg.addon} ${tg.addon_name ?? ''}`).includes(q)) continue
    let g = groups.get(tg.addon)
    if (!g) {
      g = { addon: tg.addon, addonName: tg.addon_name || tg.addon, targets: [] }
      groups.set(tg.addon, g)
    }
    g.targets.push(tg)
  }
  const out = [...groups.values()].sort((a, b) => a.addonName.localeCompare(b.addonName))
  for (const g of out) g.targets.sort((a, b) => (a.label || a.model).localeCompare(b.label || b.model))
  return out
}

/** Permission flags a block kind needs (`upsert` may write both ways). */
export function requiredPermissions(kind: string): Array<'create' | 'update' | 'delete'> {
  switch (kind) {
    case 'record.create':
      return ['create']
    case 'record.upsert':
      return ['create', 'update']
    case 'record.delete':
      return ['delete']
    case 'record.update':
    case 'record.action':
    case 'record.transition':
    case 'record.restore':
      return ['update']
    default:
      return []
  }
}

export type BlockedReason = { code: 'noPermission'; ops: Array<'create' | 'update' | 'delete'> } | { code: 'noAction'; kind: string }

/**
 * Why `target` cannot be used by a block of `kind`, or null when it can. A
 * blocked target is shown disabled with this reason, never hidden.
 */
export function targetBlockedReason(target: IngestTarget, kind: string | undefined): BlockedReason | null {
  if (!kind) return null
  if (!target.actions.includes(kind)) return { code: 'noAction', kind }
  const missing = requiredPermissions(kind).filter((p) => !target.permissions[p])
  return missing.length > 0 ? { code: 'noPermission', ops: missing } : null
}

const squash = (s: string) => norm(s).replace(/[^a-z0-9]/g, '')

/**
 * Suggests the event field for a column by normalized name (`Customer_Email`
 * == `customerEmail`, or the last path segment: `customer.email` == `email`).
 * Only a SUGGESTION: the UI shows it and never applies it by itself.
 */
export function suggestSource(column: { name: string; label?: string }, fields: Array<{ path: string; type: string }>): string | undefined {
  const leaf = (p: string) => p.split('.').pop() as string
  const wanted = [squash(column.name), column.label ? squash(column.label) : ''].filter(Boolean)
  const scalar = fields.filter((f) => f.type !== 'object' && f.type !== 'array')
  for (const w of wanted) {
    const full = scalar.find((f) => squash(f.path) === w)
    if (full) return full.path
  }
  for (const w of wanted) {
    const part = scalar.find((f) => squash(leaf(f.path)) === w)
    if (part) return part.path
  }
  return undefined
}

export interface RecordIssue {
  column: string
  code: 'missing' | 'type' | 'option'
  expected?: string
}

const NUMERIC = new Set(['number', 'integer', 'decimal', 'float', 'currency', 'money'])
const blank = (v: unknown) => v === undefined || v === null || v === ''

/**
 * Checks the record a mapping would write against the column declarations
 * (required, type, `options`). Local and advisory: the server stays the judge.
 * `mapped` lists the columns that have a source; only those can be "missing"
 * (an unmapped required column is a separate, blocking problem).
 */
export function validateRecord(target: IngestTarget, record: Record<string, unknown>, mapped: string[]): RecordIssue[] {
  const issues: RecordIssue[] = []
  for (const c of target.columns) {
    if (!mapped.includes(c.name)) continue
    const v = record[c.name]
    if (blank(v)) {
      if (c.required) issues.push({ column: c.name, code: 'missing' })
      continue
    }
    const type = (c.type ?? 'text').toLowerCase()
    if (NUMERIC.has(type)) {
      const ok = typeof v === 'number' ? Number.isFinite(v) : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))
      if (!ok) issues.push({ column: c.name, code: 'type', expected: 'number' })
    } else if (type === 'boolean' || type === 'bool') {
      if (!(typeof v === 'boolean' || v === 'true' || v === 'false')) issues.push({ column: c.name, code: 'type', expected: 'boolean' })
    } else if (type === 'date' || type === 'datetime' || type === 'timestamp') {
      if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) issues.push({ column: c.name, code: 'type', expected: 'date' })
    } else if (typeof v === 'object') {
      issues.push({ column: c.name, code: 'type', expected: 'text' })
    }
    if (c.options && c.options.length > 0 && !c.options.some((o) => o.value === String(v))) issues.push({ column: c.name, code: 'option' })
  }
  return issues
}

/** Required columns (without a server default) that the mapping leaves empty. */
export function unmappedRequired(target: IngestTarget, mapping: Record<string, string>): string[] {
  return target.columns.filter((c) => c.required && c.default === undefined && (mapping[c.name] ?? '').trim() === '').map((c) => c.name)
}

export interface InboundProblem {
  step: number
  code: 'unknownTarget' | 'blocked' | 'matchNotCandidate' | 'matchMissing' | 'requiredUnmapped' | 'columnNotAllowed'
  vars: Record<string, string | number>
}

interface CheckableBlock {
  do: string
  model?: string
  match?: string[]
  mapping?: Record<string, string>
}

const WRITES = new Set(['record.create', 'record.update', 'record.upsert'])

/**
 * Save-blocking problems of the record blocks against the server catalogue.
 * Call it only when the host provides `listTargets`: without a catalogue
 * nothing can be verified and the legacy free-text behaviour applies.
 */
export function inboundProblems(actions: CheckableBlock[], targets: IngestTarget[]): InboundProblem[] {
  const out: InboundProblem[] = []
  actions.forEach((a, step) => {
    if (!a.do.startsWith('record.') || !a.model) return
    const tg = targets.find((x) => x.model === a.model)
    if (!tg) {
      out.push({ step, code: 'unknownTarget', vars: { model: a.model } })
      return
    }
    if (targetBlockedReason(tg, a.do)) out.push({ step, code: 'blocked', vars: { model: a.model } })
    const match = a.match ?? []
    if (match.length > 0 && !tg.match_candidates.some((c) => c.length === match.length && c.every((x) => match.includes(x)))) {
      out.push({ step, code: 'matchNotCandidate', vars: { model: a.model } })
    }
    if (a.do !== 'record.create' && match.length === 0) out.push({ step, code: 'matchMissing', vars: { model: a.model } })
    const mapping = a.mapping ?? {}
    const allowed = new Set(tg.columns.map((c) => c.name))
    for (const k of Object.keys(mapping)) if (!allowed.has(k)) out.push({ step, code: 'columnNotAllowed', vars: { column: k } })
    if (WRITES.has(a.do)) {
      const missing = unmappedRequired(tg, mapping)
      if (missing.length > 0) out.push({ step, code: 'requiredUnmapped', vars: { columns: missing.join(', ') } })
    }
  })
  return out
}
