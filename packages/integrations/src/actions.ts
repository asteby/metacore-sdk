import { ACTION_KINDS, type ActionBlock, type ActionKind } from './types'

export function newAction(kind: ActionKind): ActionBlock {
  switch (kind) {
    case 'record.upsert':
      return { do: 'record.upsert', model: '', match: [], mapping: {} }
    case 'event.emit':
      return { do: 'event.emit', name: '', payload: {} }
    case 'notify':
      return { do: 'notify', template: '' }
    case 'command.run':
      return { do: 'command.run', command: '' }
  }
}

const isStr = (v: unknown): v is string => typeof v === 'string'
const isStrMap = (v: unknown): v is Record<string, string> =>
  !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(isStr)

/**
 * Validates an untrusted list (advanced JSON view) against the closed set of
 * blocks. Returns the normalized list or the first error message.
 */
export function parseActions(input: unknown): { ok: true; actions: ActionBlock[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'actions must be an array' }
  const out: ActionBlock[] = []
  for (let i = 0; i < input.length; i++) {
    const a = input[i] as Record<string, unknown> | null
    const at = `actions[${i}]`
    if (!a || typeof a !== 'object') return { ok: false, error: `${at} must be an object` }
    const kind = a.do
    if (!ACTION_KINDS.includes(kind as ActionKind)) {
      return { ok: false, error: `${at}.do must be one of ${ACTION_KINDS.join(', ')}` }
    }
    switch (kind as ActionKind) {
      case 'record.upsert':
        if (!isStr(a.model)) return { ok: false, error: `${at}.model must be a string` }
        if (!Array.isArray(a.match) || !a.match.every(isStr)) return { ok: false, error: `${at}.match must be a list of strings` }
        if (!isStrMap(a.mapping)) return { ok: false, error: `${at}.mapping must map strings to strings` }
        out.push({ do: 'record.upsert', model: a.model, match: a.match, mapping: a.mapping })
        break
      case 'event.emit':
        if (!isStr(a.name)) return { ok: false, error: `${at}.name must be a string` }
        if (!isStrMap(a.payload ?? {})) return { ok: false, error: `${at}.payload must map strings to strings` }
        out.push({ do: 'event.emit', name: a.name, payload: (a.payload ?? {}) as Record<string, string> })
        break
      case 'notify': {
        if (!isStr(a.template)) return { ok: false, error: `${at}.template must be a string` }
        const w = a.when as { path?: unknown; eq?: unknown } | undefined
        if (w !== undefined) {
          if (!w || !isStr(w.path) || !['string', 'number', 'boolean'].includes(typeof w.eq)) {
            return { ok: false, error: `${at}.when needs path (string) and eq (scalar)` }
          }
          out.push({ do: 'notify', template: a.template, when: { path: w.path, eq: w.eq as string | number | boolean } })
        } else out.push({ do: 'notify', template: a.template })
        break
      }
      case 'command.run':
        if (!isStr(a.command)) return { ok: false, error: `${at}.command must be a string` }
        if (a.args !== undefined && !isStrMap(a.args)) return { ok: false, error: `${at}.args must map strings to strings` }
        out.push(a.args ? { do: 'command.run', command: a.command, args: a.args as Record<string, string> } : { do: 'command.run', command: a.command })
        break
    }
  }
  return { ok: true, actions: out }
}

/** Human-facing problems that block saving (empty required fields). */
export function incompleteActions(actions: ActionBlock[]): number[] {
  const bad: number[] = []
  actions.forEach((a, i) => {
    const missing =
      (a.do === 'record.upsert' && (a.model.trim() === '' || a.match.length === 0)) ||
      (a.do === 'event.emit' && a.name.trim() === '') ||
      (a.do === 'notify' && a.template.trim() === '') ||
      (a.do === 'command.run' && a.command.trim() === '')
    if (missing) bad.push(i)
  })
  return bad
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list
  const next = list.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item as T)
  return next
}
