import type { IngestTarget } from './types'

const isStr = (v: unknown): v is string => typeof v === 'string'
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const optStr = (v: unknown) => v === undefined || isStr(v)
const optBool = (v: unknown) => v === undefined || typeof v === 'boolean'
const strList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr)

/**
 * Validates the body of `GET /api/integrations/targets` (kernel
 * `inbound.Target[]`, snake_case) and returns it typed, unchanged. Fields
 * added in v0.272 (`actions_available`, `stage`, `restorable`, `ingest_cursor`)
 * are optional so older hosts still parse.
 */
export function parseIngestTargets(input: unknown): { ok: true; targets: IngestTarget[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'targets must be an array' }
  for (let i = 0; i < input.length; i++) {
    const t = input[i] as unknown
    const at = `targets[${i}]`
    if (!isObj(t)) return { ok: false, error: `${at} must be an object` }
    if (!isStr(t.addon) || !isStr(t.model) || t.model === '') return { ok: false, error: `${at} needs addon and model (strings)` }
    if (!optStr(t.addon_name) || !optStr(t.label) || !optStr(t.ingest_cursor)) return { ok: false, error: `${at}: addon_name, label and ingest_cursor must be strings` }
    if (!Array.isArray(t.columns)) return { ok: false, error: `${at}.columns must be an array` }
    for (const c of t.columns as unknown[]) {
      if (!isObj(c) || !isStr(c.name) || c.name === '') return { ok: false, error: `${at}.columns[] needs name` }
      if (!optStr(c.label) || !optStr(c.type) || !optStr(c.ref) || !optBool(c.required) || !optBool(c.unique)) {
        return { ok: false, error: `${at}.columns[${c.name}] has a field of the wrong type` }
      }
      if (c.options !== undefined && !(Array.isArray(c.options) && c.options.every((o) => isObj(o) && isStr(o.value)))) {
        return { ok: false, error: `${at}.columns[${c.name}].options must be {value,label}[]` }
      }
    }
    if (!Array.isArray(t.match_candidates) || !t.match_candidates.every(strList)) return { ok: false, error: `${at}.match_candidates must be string[][]` }
    if (typeof t.soft_delete !== 'boolean') return { ok: false, error: `${at}.soft_delete must be a boolean` }
    if (!strList(t.actions)) return { ok: false, error: `${at}.actions must be a list of strings` }
    const p = t.permissions
    if (!isObj(p) || typeof p.create !== 'boolean' || typeof p.update !== 'boolean' || typeof p.delete !== 'boolean') {
      return { ok: false, error: `${at}.permissions needs create/update/delete booleans` }
    }
    const s = t.scope
    if (!isObj(s) || typeof s.branch !== 'boolean' || typeof s.entity !== 'boolean') return { ok: false, error: `${at}.scope needs branch/entity booleans` }
    if (t.guard_candidates !== undefined && !strList(t.guard_candidates)) return { ok: false, error: `${at}.guard_candidates must be a list of strings` }
    if (!optBool(t.restorable)) return { ok: false, error: `${at}.restorable must be a boolean` }
    if (t.actions_available !== undefined) {
      const ok =
        Array.isArray(t.actions_available) &&
        t.actions_available.every((a) => isObj(a) && isStr(a.key) && isStr(a.permission) && Array.isArray(a.params) && (a.requires_state === undefined || strList(a.requires_state)))
      if (!ok) return { ok: false, error: `${at}.actions_available must be {key,params,permission}[]` }
    }
    if (t.stage !== undefined && t.stage !== null) {
      const st = t.stage
      const ok =
        isObj(st) &&
        isStr(st.field) &&
        Array.isArray(st.stages) &&
        st.stages.every((x) => isObj(x) && isStr(x.key)) &&
        Array.isArray(st.transitions) &&
        st.transitions.every((x) => isObj(x) && isStr(x.from) && isStr(x.to))
      if (!ok) return { ok: false, error: `${at}.stage must be {field,stages,transitions} or null` }
    }
  }
  return { ok: true, targets: input as IngestTarget[] }
}
