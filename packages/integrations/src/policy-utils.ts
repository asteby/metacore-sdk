import { MAX_CONDITION_IN, type ActionBlock, type Condition, type ConditionScalar, type IngestTarget, type IngestTargetColumn } from './types'

// Pure helpers of the policy editors (guard, defaults, action params, stage
// transitions, `when`). The server catalogue (`IngestTarget`) is the only source
// of what can be chosen; nothing here invents options.

/** `when` operators the editor exposes (`exists` is not accepted by OPS today). */
export const WHEN_OPS = ['eq', 'ne', 'in'] as const
export type WhenOp = (typeof WHEN_OPS)[number]

const NUMBER_TYPES = new Set(['number', 'integer', 'decimal', 'float', 'currency', 'money', 'int', 'bigint'])
const DATE_TYPES = new Set(['date', 'datetime', 'timestamp', 'timestamptz'])
const TEXT_TYPES = new Set(['text', 'string', 'varchar', 'char', 'email', 'url', 'phone', 'uuid'])
const BOOL_TYPES = new Set(['boolean', 'bool'])

const typeOf = (c: IngestTargetColumn) => (c.type ?? 'text').toLowerCase()
export const isNumberColumn = (c: IngestTargetColumn) => NUMBER_TYPES.has(typeOf(c))
export const isDateColumn = (c: IngestTargetColumn) => DATE_TYPES.has(typeOf(c))
export const isTextColumn = (c: IngestTargetColumn) => TEXT_TYPES.has(typeOf(c)) && !(c.options && c.options.length > 0)
export const isBoolColumn = (c: IngestTargetColumn) => BOOL_TYPES.has(typeOf(c))

/** Kinds that carry an order `guard`. */
export const GUARD_KINDS: readonly string[] = ['record.create', 'record.update', 'record.upsert', 'record.delete']
/** Kinds that carry constant `defaults`. */
export const DEFAULTS_KINDS: readonly string[] = ['record.create', 'record.update', 'record.upsert']
/** Kinds whose rows are chosen only by `match` (mapping holds only match fields). */
export const SELECT_ONLY_KINDS: readonly string[] = ['record.delete', 'record.action', 'record.transition', 'record.restore']
/** Kinds with `max_rows`. */
export const MAX_ROWS_KINDS: readonly string[] = SELECT_ONLY_KINDS

export interface GuardColumns {
  /** Declared by the server (`ingest_cursor` first, then `guard_candidates`). */
  suggested: string[]
  /** Other writable date/number columns. */
  other: string[]
  recommended?: string
}

/** Columns a `guard.field` may name, split into server-suggested and the rest. */
export function guardColumns(target: IngestTarget): GuardColumns {
  const suggested: string[] = []
  const add = (n: string | undefined) => {
    if (n && !suggested.includes(n)) suggested.push(n)
  }
  add(target.ingest_cursor)
  for (const c of target.guard_candidates ?? []) add(c)
  const other = target.columns.filter((c) => (isDateColumn(c) || isNumberColumn(c)) && !suggested.includes(c.name)).map((c) => c.name)
  return { suggested, other, recommended: suggested[0] }
}

export function isGuardField(target: IngestTarget, field: string): boolean {
  const g = guardColumns(target)
  return g.suggested.includes(field) || g.other.includes(field)
}

/** Column default for a fresh "fixed value" row: the typed zero of the column. */
export function initialDefault(c: IngestTargetColumn): unknown {
  if (c.options && c.options.length > 0) return c.options[0]!.value
  if (isBoolColumn(c)) return false
  if (isNumberColumn(c)) return 0
  return ''
}

/** Types the raw text of a "fixed value" input for `c` (numbers/booleans keep their type). */
export function coerceDefault(c: IngestTargetColumn, raw: string): unknown {
  if (isNumberColumn(c)) return raw.trim() !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw
  if (isBoolColumn(c)) return raw === 'true' ? true : raw === 'false' ? false : raw
  return raw
}

/** True when `v` is an acceptable constant for the column. */
export function defaultValid(c: IngestTargetColumn, v: unknown): boolean {
  if (c.options && c.options.length > 0) return c.options.some((o) => o.value === String(v))
  if (isNumberColumn(c)) return typeof v === 'number' && Number.isFinite(v)
  if (isBoolColumn(c)) return typeof v === 'boolean'
  if (isDateColumn(c)) return typeof v === 'string' && v !== '' && !Number.isNaN(Date.parse(v))
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
}

/** States `record.transition.to` may name: targets of the declared transitions. */
export function transitionTargets(target: IngestTarget): Set<string> {
  return new Set((target.stage?.transitions ?? []).map((t) => t.to))
}

/** States a transition to `to` may start from. */
export function transitionSources(target: IngestTarget, to: string): string[] {
  return (target.stage?.transitions ?? []).filter((t) => t.to === to).map((t) => t.from)
}

const PARAM_REF = /^\{\{\s*payload\.([\w.]+)\s*\}\}$/
export type ParamMode = 'unmapped' | 'field' | 'literal'

/** Reads a stored `params` value as editor state. */
export function paramState(v: unknown): { mode: ParamMode; value: string } {
  if (v === undefined || v === null || v === '') return { mode: 'unmapped', value: '' }
  const s = String(v)
  const m = PARAM_REF.exec(s)
  return m ? { mode: 'field', value: m[1] as string } : { mode: 'literal', value: s }
}

export const paramTemplate = (mode: ParamMode, value: string): string => (mode === 'field' ? `{{payload.${value}}}` : value)

/** Scalar typed from the text of a `when` value box, honouring the field type. */
export function coerceWhenValue(raw: string, fieldType?: string): ConditionScalar {
  if (fieldType === 'string') return raw
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw.trim() !== '' && Number.isFinite(Number(raw))) return Number(raw)
  return raw
}

export type WhenIssue = 'path' | 'value' | 'inEmpty' | 'inMax' | 'op'

/** Why a `when` cannot be saved (null when it is a valid eq|ne|in). */
export function whenIssue(w: Condition | undefined): WhenIssue | null {
  if (!w) return null
  if (w.exists !== undefined) return 'op'
  if (typeof w.path !== 'string' || w.path.trim() === '') return 'path'
  if (w.in !== undefined) {
    if (w.in.length < 1) return 'inEmpty'
    if (w.in.length > MAX_CONDITION_IN) return 'inMax'
    return null
  }
  const v = w.eq ?? w.ne
  if (v === undefined || v === '') return 'value'
  return null
}

export function whenOp(w: Condition | undefined): WhenOp | undefined {
  if (!w) return undefined
  return w.in !== undefined ? 'in' : w.ne !== undefined ? 'ne' : w.eq !== undefined ? 'eq' : undefined
}

/** True when the editor can show this `when` (exactly one of eq|ne|in). */
export function whenEditable(w: Condition | undefined): boolean {
  if (!w) return true
  if (w.exists !== undefined) return false
  return [w.eq, w.ne, w.in].filter((x) => x !== undefined).length === 1
}

export type PolicyCode =
  | 'whenInvalid'
  | 'mappingEmpty'
  | 'matchUnmapped'
  | 'mappingNotMatch'
  | 'guardIncomplete'
  | 'guardFieldNotAllowed'
  | 'guardPathInvalid'
  | 'defaultColumn'
  | 'defaultType'
  | 'defaultMapped'
  | 'idempotencyInvalid'
  | 'maxRows'
  | 'deleteMode'
  | 'actionUnavailable'
  | 'paramRequired'
  | 'paramUnknown'
  | 'transitionInvalid'
  | 'restoreUnavailable'

export interface PolicyProblem {
  code: PolicyCode
  vars: Record<string, string | number>
}

type Loose = Record<string, unknown> & { do: string; model?: string; match?: string[]; mapping?: Record<string, string> }

/** `when` problems of any block (independent of the catalogue). */
export function whenProblems(a: { when?: Condition }): PolicyProblem[] {
  const issue = whenIssue(a.when)
  return issue ? [{ code: 'whenInvalid', vars: { reason: issue } }] : []
}

/**
 * Save-blocking problems of the policy of one `record.*` block against its
 * target (guard, defaults, idempotency, max_rows, action, params, transition).
 * Mirrors the kernel `CheckContract`; the server stays the judge.
 */
export function policyProblems(block: ActionBlock | Loose, tg: IngestTarget): PolicyProblem[] {
  const a = block as Loose
  const out: PolicyProblem[] = []
  const cols = new Map(tg.columns.map((c) => [c.name, c]))
  const mapping = a.mapping ?? {}
  const match = a.match ?? []

  if (Object.keys(mapping).length === 0) out.push({ code: 'mappingEmpty', vars: { model: tg.model } })
  const unmappedMatch = match.filter((m) => (mapping[m] ?? '').trim() === '')
  // A match that is not a declared candidate is reported once, by `matchNotCandidate`.
  const candidate = tg.match_candidates.some((c) => c.length === match.length && c.every((x) => match.includes(x)))
  if (unmappedMatch.length > 0 && candidate) out.push({ code: 'matchUnmapped', vars: { columns: unmappedMatch.join(', ') } })
  if (SELECT_ONLY_KINDS.includes(a.do)) {
    const extra = Object.keys(mapping).filter((k) => !match.includes(k))
    if (extra.length > 0) out.push({ code: 'mappingNotMatch', vars: { columns: extra.join(', ') } })
  }

  if (MAX_ROWS_KINDS.includes(a.do) && a.max_rows !== undefined) {
    const n = a.max_rows
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 100) out.push({ code: 'maxRows', vars: {} })
  }

  if (a.do === 'record.delete' && a.mode !== undefined && a.mode !== 'soft') out.push({ code: 'deleteMode', vars: {} })

  const g = a.guard as { field?: unknown; path?: unknown; op?: unknown } | undefined
  if (g && GUARD_KINDS.includes(a.do)) {
    const field = typeof g.field === 'string' ? g.field : ''
    const path = typeof g.path === 'string' ? g.path : ''
    if (field.trim() === '' || path.trim() === '') out.push({ code: 'guardIncomplete', vars: {} })
    else {
      if (!isGuardField(tg, field)) out.push({ code: 'guardFieldNotAllowed', vars: { column: field } })
      if (!/^payload\./.test(path)) out.push({ code: 'guardPathInvalid', vars: { path } })
    }
  }

  const defaults = (a.defaults ?? undefined) as Record<string, unknown> | undefined
  if (defaults && DEFAULTS_KINDS.includes(a.do)) {
    for (const [k, v] of Object.entries(defaults)) {
      const c = cols.get(k)
      if (!c) out.push({ code: 'defaultColumn', vars: { column: k } })
      else {
        if (!defaultValid(c, v)) out.push({ code: 'defaultType', vars: { column: k } })
        if (k in mapping) out.push({ code: 'defaultMapped', vars: { column: k } })
      }
    }
  }

  if (a.do === 'record.create') {
    const f = typeof a.idempotency_field === 'string' ? a.idempotency_field : ''
    const c = cols.get(f)
    if (f !== '' && (!c || !isTextColumn(c) || f in mapping || (defaults && f in defaults))) out.push({ code: 'idempotencyInvalid', vars: { column: f } })
  }

  if (a.do === 'record.action') {
    const key = typeof a.action === 'string' ? a.action : ''
    const def = (tg.actions_available ?? []).find((x) => x.key === key)
    if (key !== '' && !def) out.push({ code: 'actionUnavailable', vars: { action: key } })
    if (def) {
      const params = (a.params ?? {}) as Record<string, unknown>
      for (const p of def.params) {
        if (p.required && paramState(params[p.name]).mode === 'unmapped') out.push({ code: 'paramRequired', vars: { param: p.name } })
      }
      for (const k of Object.keys(params)) if (k !== 'reason' && !def.params.some((p) => p.name === k)) out.push({ code: 'paramUnknown', vars: { param: k } })
    }
  }

  if (a.do === 'record.transition') {
    const to = typeof a.to === 'string' ? a.to : ''
    if (to !== '' && !transitionTargets(tg).has(to)) out.push({ code: 'transitionInvalid', vars: { state: to } })
  }

  if (a.do === 'record.restore' && tg.restorable === false) out.push({ code: 'restoreUnavailable', vars: { model: tg.model } })
  return out
}

/** Clears the fields that only make sense for the previous model. */
export function resetPolicy<T extends ActionBlock>(a: T): T {
  const o = { ...a } as Record<string, unknown>
  for (const k of ['guard', 'defaults', 'params']) delete o[k]
  if ('idempotency_field' in o) o.idempotency_field = ''
  if ('action' in o) o.action = ''
  if ('to' in o) o.to = ''
  return o as unknown as T
}
