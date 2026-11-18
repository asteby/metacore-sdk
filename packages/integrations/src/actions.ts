import {
  ACTION_KINDS,
  MAX_CONDITION_IN,
  VISUAL_ACTION_KINDS,
  type ActionBlock,
  type ActionKind,
  type BlockGuard,
  type Condition,
  type ConditionScalar,
} from './types'

export function newAction(kind: ActionKind): ActionBlock {
  switch (kind) {
    case 'record.create':
      return { do: 'record.create', model: '', idempotency_field: '', mapping: {} }
    case 'record.update':
      return { do: 'record.update', model: '', match: [], mapping: {} }
    case 'record.upsert':
      return { do: 'record.upsert', model: '', match: [], mapping: {} }
    case 'record.delete':
      return { do: 'record.delete', model: '', match: [], mapping: {} }
    case 'record.action':
      return { do: 'record.action', model: '', match: [], mapping: {}, action: '' }
    case 'record.transition':
      return { do: 'record.transition', model: '', match: [], mapping: {}, to: '' }
    case 'record.restore':
      return { do: 'record.restore', model: '', match: [], mapping: {} }
    case 'event.emit':
      return { do: 'event.emit', name: '', payload: {} }
    case 'notify':
      return { do: 'notify', template: '' }
    case 'command.run':
      return { do: 'command.run', command: '' }
  }
}

const isStr = (v: unknown): v is string => typeof v === 'string'
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isStrMap = (v: unknown): v is Record<string, string> => isObj(v) && Object.values(v).every(isStr)
const isScalar = (v: unknown): v is ConditionScalar => ['string', 'number', 'boolean'].includes(typeof v) && !(typeof v === 'number' && !Number.isFinite(v))

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

/** `when` = path + EXACTLY one of eq|ne|in|exists (kernel `inbound.Condition`). */
function parseCondition(raw: unknown, at: string): Result<Condition> {
  if (!isObj(raw) || !isStr(raw.path) || raw.path.trim() === '') return { ok: false, error: `${at}.when needs path (string)` }
  const ops = ['eq', 'ne', 'in', 'exists'].filter((k) => raw[k] !== undefined)
  if (ops.length !== 1) return { ok: false, error: `${at}.when needs exactly one of eq|ne|in|exists` }
  const op = ops[0]
  if (op === 'eq' || op === 'ne') {
    if (!isScalar(raw[op])) return { ok: false, error: `${at}.when.${op} must be a scalar` }
    return { ok: true, value: { path: raw.path, [op]: raw[op] as ConditionScalar } }
  }
  if (op === 'in') {
    const list = raw.in
    if (!Array.isArray(list) || list.length < 1 || list.length > MAX_CONDITION_IN || !list.every(isScalar)) {
      return { ok: false, error: `${at}.when.in needs 1 to ${MAX_CONDITION_IN} scalar values` }
    }
    return { ok: true, value: { path: raw.path, in: list as ConditionScalar[] } }
  }
  if (typeof raw.exists !== 'boolean') return { ok: false, error: `${at}.when.exists must be a boolean` }
  return { ok: true, value: { path: raw.path, exists: raw.exists } }
}

function parseGuard(raw: unknown, at: string): Result<BlockGuard> {
  if (!isObj(raw) || !isStr(raw.field) || !isStr(raw.path) || (raw.op !== 'gte' && raw.op !== 'gt')) {
    return { ok: false, error: `${at}.guard needs field (string), path (string) and op (gte|gt)` }
  }
  return { ok: true, value: { field: raw.field, path: raw.path, op: raw.op } }
}

/** Fields a state block (`record.action|transition|restore`) never accepts. */
const STATE_FOREIGN = ['defaults', 'idempotency_field', 'mode', 'guard']
const GUARDED: readonly ActionKind[] = ['record.create', 'record.update', 'record.upsert', 'record.delete']

/**
 * Validates an untrusted list (advanced JSON view) against the closed set of
 * blocks. Returns the normalized list or the first error message. Field names
 * are the OPS backend's (`eventsint.Block`), so the output round-trips.
 */
export function parseActions(input: unknown): { ok: true; actions: ActionBlock[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'actions must be an array' }
  const out: ActionBlock[] = []
  for (let i = 0; i < input.length; i++) {
    const a = input[i] as Record<string, unknown> | null
    const at = `actions[${i}]`
    if (!a || typeof a !== 'object') return { ok: false, error: `${at} must be an object` }
    const kind = a.do as ActionKind
    if (!ACTION_KINDS.includes(kind)) {
      return { ok: false, error: `${at}.do must be one of ${ACTION_KINDS.join(', ')}` }
    }

    let when: Condition | undefined
    if (a.when !== undefined) {
      const w = parseCondition(a.when, at)
      if (!w.ok) return w
      when = w.value
    }
    const withWhen = <T extends object>(b: T): T => (when ? { ...b, when } : b)

    if (kind.startsWith('record.')) {
      if (!isStr(a.model)) return { ok: false, error: `${at}.model must be a string` }
      const matchOptional = kind === 'record.create'
      if (a.match === undefined && matchOptional) {
        // ok
      } else if (!Array.isArray(a.match) || !a.match.every(isStr)) return { ok: false, error: `${at}.match must be a list of strings` }
      if (!isStrMap(a.mapping)) return { ok: false, error: `${at}.mapping must map strings to strings` }
      const model = a.model
      const mapping = a.mapping
      const match = a.match as string[] | undefined

      if (kind === 'record.delete' || kind === 'record.action' || kind === 'record.transition' || kind === 'record.restore') {
        if (a.max_rows !== undefined && (!Number.isInteger(a.max_rows) || (a.max_rows as number) < 1 || (a.max_rows as number) > 100)) {
          return { ok: false, error: `${at}.max_rows must be an integer between 1 and 100` }
        }
      } else if (a.max_rows !== undefined) return { ok: false, error: `${at}: field "max_rows" does not apply to ${kind}` }
      if (kind !== 'record.delete' && a.mode !== undefined) {
        return { ok: false, error: `${at}: field "mode" does not apply to ${kind}` }
      }
      if (a.guard !== undefined && !GUARDED.includes(kind)) {
        return { ok: false, error: `${at}: field "guard" does not apply to ${kind}` }
      }
      if (a.defaults !== undefined && !(kind === 'record.create' || kind === 'record.update' || kind === 'record.upsert')) {
        return { ok: false, error: `${at}: field "defaults" does not apply to ${kind}` }
      }
      if (a.defaults !== undefined && !isObj(a.defaults)) return { ok: false, error: `${at}.defaults must be an object` }
      if (a.idempotency_field !== undefined && kind !== 'record.create') {
        return { ok: false, error: `${at}: field "idempotency_field" does not apply to ${kind}` }
      }
      let guard: BlockGuard | undefined
      if (a.guard !== undefined) {
        const g = parseGuard(a.guard, at)
        if (!g.ok) return g
        guard = g.value
      }
      const defaults = a.defaults as Record<string, unknown> | undefined
      const rec = (base: Record<string, unknown>, ...extra: Array<[string, unknown]>) => {
        const o: Record<string, unknown> = { ...base }
        for (const [k, v] of extra) if (v !== undefined) o[k] = v
        return o as unknown as ActionBlock
      }

      switch (kind) {
        case 'record.create':
          if (!isStr(a.idempotency_field)) return { ok: false, error: `${at}.idempotency_field must be a string` }
          out.push(
            withWhen(
              rec({ do: kind, model }, ['match', match], ['mapping', mapping], ['idempotency_field', a.idempotency_field], ['defaults', defaults], ['guard', guard]),
            ),
          )
          break
        case 'record.update':
        case 'record.upsert':
          out.push(withWhen(rec({ do: kind, model, match, mapping }, ['defaults', defaults], ['guard', guard])))
          break
        case 'record.delete':
          // OPS forbids hard delete (hard_delete_disabled): only soft exists.
          if (a.mode !== undefined && a.mode !== 'soft') {
            return { ok: false, error: `${at}.mode "${String(a.mode)}" is not allowed: hard_delete_disabled (only "soft")` }
          }
          out.push(withWhen(rec({ do: kind, model, match, mapping }, ['mode', a.mode], ['max_rows', a.max_rows], ['guard', guard])))
          break
        default: {
          // record.action | record.transition | record.restore
          for (const f of STATE_FOREIGN) if (a[f] !== undefined) return { ok: false, error: `${at}: field "${f}" does not apply to ${kind}` }
          if (kind === 'record.action') {
            if (!isStr(a.action)) return { ok: false, error: `${at}.action must be a string` }
            if (a.params !== undefined && !isObj(a.params)) return { ok: false, error: `${at}.params must be an object` }
            if (a.on_ineligible !== undefined && a.on_ineligible !== 'noop' && a.on_ineligible !== 'fail') {
              return { ok: false, error: `${at}.on_ineligible must be noop|fail` }
            }
            out.push(
              withWhen(
                rec({ do: kind, model, match, mapping, action: a.action }, ['params', a.params], ['on_ineligible', a.on_ineligible], ['max_rows', a.max_rows]),
              ),
            )
          } else if (kind === 'record.transition') {
            if (!isStr(a.to)) return { ok: false, error: `${at}.to must be a string` }
            out.push(withWhen(rec({ do: kind, model, match, mapping, to: a.to }, ['max_rows', a.max_rows])))
          } else {
            out.push(withWhen(rec({ do: kind, model, match, mapping }, ['max_rows', a.max_rows])))
          }
        }
      }
      continue
    }

    switch (kind) {
      case 'event.emit':
        if (!isStr(a.name)) return { ok: false, error: `${at}.name must be a string` }
        if (!isStrMap(a.payload ?? {})) return { ok: false, error: `${at}.payload must map strings to strings` }
        out.push(withWhen({ do: 'event.emit', name: a.name, payload: (a.payload ?? {}) as Record<string, string> }))
        break
      case 'notify':
        if (!isStr(a.template)) return { ok: false, error: `${at}.template must be a string` }
        out.push(withWhen({ do: 'notify', template: a.template }))
        break
      case 'command.run':
        if (!isStr(a.command)) return { ok: false, error: `${at}.command must be a string` }
        if (a.args !== undefined && !isStrMap(a.args)) return { ok: false, error: `${at}.args must map strings to strings` }
        out.push(withWhen(a.args ? { do: 'command.run', command: a.command, args: a.args as Record<string, string> } : { do: 'command.run', command: a.command }))
        break
    }
  }
  return { ok: true, actions: out }
}

/** Human-facing problems that block saving (empty required fields). */
export function incompleteActions(actions: ActionBlock[]): number[] {
  const bad: number[] = []
  const blank = (s: string | undefined) => (s ?? '').trim() === ''
  actions.forEach((a, i) => {
    let missing = false
    switch (a.do) {
      case 'record.create':
        missing = blank(a.model) || blank(a.idempotency_field) || Object.keys(a.mapping).length === 0
        break
      case 'record.upsert':
      case 'record.update':
      case 'record.delete':
      case 'record.restore':
        missing = blank(a.model) || a.match.length === 0
        break
      case 'record.action':
        missing = blank(a.model) || a.match.length === 0 || blank(a.action)
        break
      case 'record.transition':
        missing = blank(a.model) || a.match.length === 0 || blank(a.to)
        break
      case 'event.emit':
        missing = blank(a.name)
        break
      case 'notify':
        missing = blank(a.template)
        break
      case 'command.run':
        missing = blank(a.command)
        break
    }
    if (missing) bad.push(i)
  })
  return bad
}

/**
 * True when the visual editor cannot show the whole block (a kind it does not
 * author, a guard/defaults, or a `when` other than a single `eq` on notify):
 * the panel then sends the author to the advanced (JSON) view.
 */
export function needsAdvanced(a: ActionBlock): boolean {
  if (!VISUAL_ACTION_KINDS.includes(a.do)) return true
  if ('guard' in a && a.guard) return true
  if ('defaults' in a && a.defaults) return true
  if (a.when) {
    const w = a.when
    return !(a.do === 'notify' && w.eq !== undefined && w.ne === undefined && w.in === undefined && w.exists === undefined)
  }
  return false
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list
  const next = list.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item as T)
  return next
}
