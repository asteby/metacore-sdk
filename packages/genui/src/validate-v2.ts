import { GENUI_V2_BLOCKS, GENUI_V2_SCHEMA } from './generated/genui-v2-schema'
import type { GenuiV2 } from './generated/genui-v2'
import { GenUIError, type GenUIErrorCode } from './errors'
import { isSafeLink } from './validate'

export const GENUI_V2_VERSION = 'genui/v2' as const
export type UISpecV2 = GenuiV2

/**
 * Límites de genui/v2 (ADR 0001 del SDK, §2.6). El kernel Go usa los mismos
 * valores; se sirven en `q:caps` cuando exista. Los límites por campo (hijos,
 * pestañas, pasos, columnas…) viven como maxItems/maxLength en el esquema.
 */
export const GENUI_V2_LIMITS = {
  bytes: 128 * 1024,
  depth: 6,
  blocks: 200,
  children: 24,
  tabs: 8,
  steps: 8,
  overlays: 4,
  sources: 8,
  bindings: 200,
  actions: 32,
  actionsPerBlock: 6,
  inlineTableColumns: 12,
  inlineTableRows: 200,
  sourceTableColumns: 24,
  chartSeries: 6,
  chartPoints: 500,
  formFields: 40,
  markdown: 8000,
  text: 2000,
  label: 160,
} as const

export interface ParseV2Options {
  /** Permite `http(s)` literal en enlaces. Por defecto apagado (decisión 3 del ADR: solo el chat lo enciende). */
  allowExternalLinks?: boolean
}

export type ParseV2Result =
  | { ok: true; spec: UISpecV2 }
  | { ok: false; code: GenUIErrorCode; error: string; path: string }

type Obj = Record<string, unknown>
type Schema = Record<string, any>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const root = GENUI_V2_SCHEMA as unknown as Schema

const LIMIT_BY_KEY: Record<string, GenUIErrorCode> = {
  blocks: 'genui.limit.children',
  tabs: 'genui.limit.tabs',
  steps: 'genui.limit.steps',
  overlays: 'genui.limit.overlays',
  data: 'genui.limit.sources',
  columns: 'genui.limit.columns',
  rows: 'genui.limit.rows',
  inline: 'genui.limit.rows',
  series: 'genui.limit.series',
  fields: 'genui.limit.fields',
  items: 'genui.limit.items',
  actions: 'genui.limit.actions',
  row_actions: 'genui.limit.actions',
  bulk_actions: 'genui.limit.actions',
  markdown: 'genui.limit.markdown',
}

function resolve(s: Schema): Schema {
  let cur = s
  while (typeof cur.$ref === 'string' && cur.$ref.startsWith('#/$defs/')) {
    const next = (root.$defs as Schema)[cur.$ref.slice(8)]
    if (!next) throw new Error(`esquema: ${cur.$ref} no existe`)
    cur = next
  }
  return cur
}

const kindOf = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v)
const matchesType = (t: unknown, v: unknown) => {
  const k = kindOf(v)
  const types = Array.isArray(t) ? t : [t]
  return types.some((x) => x === k || (x === 'integer' && k === 'number' && Number.isInteger(v)))
}

interface Ctx {
  blockCount: number
  blockIds: Map<string, string>
  bindings: number
  actions: number
}

function lastKey(path: string) {
  const m = /([A-Za-z_]+)(\[\d+\])?$/.exec(path)
  return m ? m[1]! : ''
}

/** Intérprete mínimo del subconjunto de JSON Schema que usa genui-v2.schema.json. */
function check(value: unknown, schema: Schema, path: string, ctx: Ctx, depth: number): void {
  const s = resolve(schema)
  if (s['x-genui'] === 'block') return checkBlock(value, path, ctx, depth)
  if (s.const !== undefined) {
    if (value !== s.const) throw new GenUIError('genui.enum', `${path}: debe ser ${JSON.stringify(s.const)}`, path)
    return
  }
  if (s.enum) {
    if (!s.enum.includes(value)) throw new GenUIError('genui.enum', `${path}: valor no permitido ${JSON.stringify(value)}`, path)
    return
  }
  if (s.anyOf || s.oneOf) {
    const alts: Schema[] = s.anyOf ?? s.oneOf
    const errors: GenUIError[] = []
    for (const alt of alts) {
      try {
        check(value, alt, path, ctx, depth)
        return
      } catch (e) {
        if (!(e instanceof GenUIError)) throw e
        errors.push(e)
      }
    }
    // Reporta el error de la alternativa cuyo tipo coincide con el valor.
    const idx = alts.findIndex((a) => {
      const r = resolve(a)
      if (!r.type || !matchesType(r.type, value)) return false
      return !isObj(value) || !r.required || r.required.every((k: string) => k in value)
    })
    const typed = idx >= 0 ? idx : alts.findIndex((a) => resolve(a).type && matchesType(resolve(a).type, value))
    if (typed < 0) throw new GenUIError('genui.type', `${path}: tipo inválido (${kindOf(value)})`, path)
    throw errors[typed]!
  }
  if (s.type !== undefined && !matchesType(s.type, value)) {
    throw new GenUIError('genui.type', `${path}: se esperaba ${[].concat(s.type).join('|')}, llegó ${kindOf(value)}`, path)
  }
  if (typeof value === 'string') {
    if (s.maxLength !== undefined && value.length > s.maxLength) {
      throw new GenUIError(LIMIT_BY_KEY[lastKey(path)] === 'genui.limit.markdown' ? 'genui.limit.markdown' : 'genui.limit.length', `${path}: excede ${s.maxLength} caracteres`, path)
    }
    if (s.pattern && !new RegExp(s.pattern, 'u').test(value)) throw new GenUIError('genui.pattern', `${path}: formato inválido`, path)
    return
  }
  if (typeof value === 'number') {
    if ((s.minimum !== undefined && value < s.minimum) || (s.maximum !== undefined && value > s.maximum)) {
      throw new GenUIError('genui.type', `${path}: fuera de rango ${s.minimum ?? ''}..${s.maximum ?? ''}`, path)
    }
    return
  }
  if (Array.isArray(value)) {
    const key = lastKey(path)
    if ((s.maxItems !== undefined && value.length > s.maxItems) || (s.minItems !== undefined && value.length < s.minItems)) {
      const over = s.maxItems !== undefined && value.length > s.maxItems
      throw new GenUIError(over ? (LIMIT_BY_KEY[key] ?? 'genui.limit.items') : 'genui.required', `${path}: ${s.minItems ?? 0}..${s.maxItems ?? '∞'} elementos`, path)
    }
    if (s.items) value.forEach((v, i) => check(v, s.items, `${path}[${i}]`, ctx, depth))
    return
  }
  if (isObj(value)) {
    const keys = Object.keys(value)
    if ((s.maxProperties !== undefined && keys.length > s.maxProperties)) {
      throw new GenUIError(LIMIT_BY_KEY[lastKey(path)] ?? 'genui.limit.properties', `${path}: demasiadas propiedades (máx. ${s.maxProperties})`, path)
    }
    if (s.minProperties !== undefined && keys.length < s.minProperties) throw new GenUIError('genui.required', `${path}: faltan propiedades`, path)
    for (const r of s.required ?? []) if (!(r in value)) throw new GenUIError('genui.required', `${path}: falta ${r}`, path)
    for (const k of keys) {
      const sub = `${path}.${k}`
      if (s.propertyNames?.pattern && !new RegExp(s.propertyNames.pattern, 'u').test(k)) throw new GenUIError('genui.pattern', `${sub}: nombre inválido`, sub)
      const ps = s.properties?.[k]
      if (ps) check(value[k], ps, sub, ctx, depth)
      else if (s.additionalProperties === false) throw new GenUIError('genui.field_not_allowed', `${sub}: campo no permitido`, sub)
      else if (isObj(s.additionalProperties)) check(value[k], s.additionalProperties, sub, ctx, depth)
    }
    if (s === resolve({ $ref: '#/$defs/action' })) ctx.actions++
  }
}

function checkBlock(raw: unknown, path: string, ctx: Ctx, depth: number): void {
  if (depth > GENUI_V2_LIMITS.depth) throw new GenUIError('genui.limit.depth', `${path}: profundidad máxima ${GENUI_V2_LIMITS.depth}`, path)
  if (!isObj(raw)) throw new GenUIError('genui.type', `${path}: el bloque debe ser un objeto`, path)
  const type = raw.type
  if (typeof type !== 'string' || !(type in GENUI_V2_BLOCKS)) throw new GenUIError('genui.unknown_block', `${path}: tipo de bloque desconocido ${String(type)}`, path)
  if (++ctx.blockCount > GENUI_V2_LIMITS.blocks) throw new GenUIError('genui.limit.blocks', `máximo ${GENUI_V2_LIMITS.blocks} bloques`, path)
  const id = raw.id
  if (typeof id === 'string') {
    if (ctx.blockIds.has(id)) throw new GenUIError('genui.duplicate_id', `${path}: id duplicado ${id}`, `${path}.id`)
    ctx.blockIds.set(id, type)
  }
  // El esquema del bloque valida sus campos; los hijos (x-genui) vuelven a checkBlock con depth+1.
  check(raw, (root.$defs as Schema)[`block_${type}`], path, ctx, depth + 1)
  const own = countActions(raw)
  if (own > GENUI_V2_LIMITS.actionsPerBlock) throw new GenUIError('genui.limit.actions', `${path}: máximo ${GENUI_V2_LIMITS.actionsPerBlock} acciones por bloque`, path)
  blockRules(raw, type, path)
}

/** Acciones propias del bloque (sin contar las de sus hijos). */
function countActions(v: unknown): number {
  if (Array.isArray(v)) return v.reduce<number>((n, x) => n + countActions(x), 0)
  if (!isObj(v)) return 0
  let n = typeof v.do === 'string' ? 1 : 0
  for (const [k, x] of Object.entries(v)) {
    if (k === 'blocks') continue
    if (k === 'tabs' && Array.isArray(x)) continue
    n += countActions(x)
  }
  return n
}

function blockRules(b: Obj, type: string, path: string) {
  const L = GENUI_V2_LIMITS
  if (type === 'table') {
    const cols = (b.columns as unknown[]).length
    if (b.source !== undefined) {
      if (b.rows !== undefined) throw new GenUIError('genui.invalid_block', `${path}: table usa rows o source, no ambos`, path)
      if (cols > L.sourceTableColumns) throw new GenUIError('genui.limit.columns', `${path}: máximo ${L.sourceTableColumns} columnas con source`, path)
    } else if (cols > L.inlineTableColumns) {
      throw new GenUIError('genui.limit.columns', `${path}: máximo ${L.inlineTableColumns} columnas en línea`, path)
    } else if (Array.isArray(b.rows) && b.rows.length > L.inlineTableRows) {
      throw new GenUIError('genui.limit.rows', `${path}: máximo ${L.inlineTableRows} filas en línea`, path)
    }
  }
  if (type === 'chart' && b.source !== undefined && b.rows !== undefined) {
    throw new GenUIError('genui.invalid_block', `${path}: chart usa rows o source, no ambos`, path)
  }
  if (type === 'tabs') {
    const keys = new Set<string>()
    for (const t of b.tabs as Obj[]) {
      if (keys.has(t.key as string)) throw new GenUIError('genui.duplicate_id', `${path}: pestaña duplicada ${String(t.key)}`, path)
      keys.add(t.key as string)
    }
  }
  if (type === 'form' || type === 'wizard') {
    const keys = new Set<string>()
    for (const f of (b.fields as Obj[] | undefined) ?? []) {
      if (keys.has(f.key as string)) throw new GenUIError('genui.duplicate_id', `${path}: campo duplicado ${String(f.key)}`, path)
      keys.add(f.key as string)
    }
    const steps = (type === 'wizard' ? b.steps : (b.layout as Obj | undefined)?.steps) as Obj[] | undefined
    for (const st of steps ?? []) for (const k of st.fields as string[]) if (!keys.has(k)) throw new GenUIError('genui.unknown_target', `${path}: el paso usa un campo inexistente ${k}`, path)
    if (type === 'form' && (b.layout as Obj | undefined)?.mode === 'steps' && !steps?.length) throw new GenUIError('genui.required', `${path}: layout.mode steps requiere steps`, path)
    if (type === 'wizard' && !steps?.length && b.ref === undefined) throw new GenUIError('genui.required', `${path}: wizard requiere steps o ref`, path)
    if (type === 'form' && !(b.fields as unknown[] | undefined)?.length) throw new GenUIError('genui.required', `${path}: form requiere fields`, path)
    if (type === 'wizard' && b.ref === undefined && !(b.fields as unknown[] | undefined)?.length) throw new GenUIError('genui.required', `${path}: wizard requiere fields`, path)
  }
  if (type === 'stats' && b.source === undefined && b.items === undefined) throw new GenUIError('genui.required', `${path}: stats requiere items o source`, path)
  if (type === 'timeline' && b.source === undefined && b.items === undefined) throw new GenUIError('genui.required', `${path}: timeline requiere items o source`, path)
}

/** $ref jamás en url, link, src ni path (anti-exfiltración); se revisa antes del esquema para dar el código preciso. */
function forbidRefs(v: unknown, path: string): void {
  if (Array.isArray(v)) return v.forEach((x, i) => forbidRefs(x, `${path}[${i}]`))
  if (!isObj(v)) return
  for (const [k, x] of Object.entries(v)) {
    const sub = `${path}.${k}`
    if (NO_REF_KEYS.has(k) && isObj(x) && '$ref' in x) throw new GenUIError('genui.ref_not_allowed', `${sub}: $ref no permitido en ${k}`, sub)
    forbidRefs(x, sub)
  }
}

const REF_ROOTS = new Set(['data', 'state', 'record', 'ctx'])
const CTX_KEYS = new Set(['locale', 'currency', 'time_zone', 'branch_id'])
const NO_REF_KEYS = new Set(['url', 'link', 'src', 'path'])
const TEXT_LIMIT_EXEMPT = new Set(['markdown'])

/** Recorre el documento completo para reglas globales (bindings, enlaces, cadenas largas). */
function walk(v: unknown, path: string, key: string, ctx: Ctx, doc: Obj, opts: ParseV2Options) {
  const L = GENUI_V2_LIMITS
  if (typeof v === 'string') {
    if (v.length > L.text && !TEXT_LIMIT_EXEMPT.has(key) && key !== 'url' && key !== 'link') throw new GenUIError('genui.limit.length', `${path}: excede ${L.text} caracteres`, path)
    if ((key === 'url' || key === 'link') && v !== '') linkRule(v, path, opts)
    return
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => walk(x, `${path}[${i}]`, key, ctx, doc, opts))
    return
  }
  if (!isObj(v)) return
  if (typeof v.$ref === 'string') {
    if (++ctx.bindings > L.bindings) throw new GenUIError('genui.limit.bindings', `máximo ${L.bindings} vinculaciones`, path)
    refRule(v.$ref, path, doc)
  } else if ('$ref' in v) {
    throw new GenUIError('genui.bad_ref', `${path}: $ref debe ser texto`, path)
  }
  for (const [k, x] of Object.entries(v)) {
    const sub = `${path}.${k}`
    if ((k === 'ref' || k === 'state') && typeof x === 'string' && !('$ref' in v)) refRule(x, sub, doc)
    if (k === 'source' && typeof x === 'string' && typeof v.type === 'string') {
      const name = x.slice(5)
      if (!isObj(doc.data) || !(name in doc.data)) throw new GenUIError('genui.unknown_target', `${sub}: la fuente ${x} no está declarada en data`, sub)
    }
    walk(x, sub, k, ctx, doc, opts)
  }
  if (typeof v.do === 'string') actionRule(v, path, doc)
}

function refRule(ref: string, path: string, doc: Obj) {
  const parts = ref.split('.')
  if (!REF_ROOTS.has(parts[0]!)) throw new GenUIError('genui.bad_ref', `${path}: raíz de vinculación inválida ${ref}`, path)
  if (parts[0] === 'ctx' && (parts.length !== 2 || !CTX_KEYS.has(parts[1]!))) throw new GenUIError('genui.bad_ref', `${path}: ctx solo expone ${[...CTX_KEYS].join(', ')}`, path)
  if (parts[0] === 'data' && (!isObj(doc.data) || !(parts[1]! in doc.data))) throw new GenUIError('genui.bad_ref', `${path}: la fuente ${parts[1]} no está declarada en data`, path)
}

function linkRule(link: string, path: string, opts: ParseV2Options) {
  if (!isSafeLink(link)) throw new GenUIError('genui.unsafe_link', `${path}: enlace no seguro`, path)
  if (!link.startsWith('/') && !opts.allowExternalLinks) throw new GenUIError('genui.external_link_disabled', `${path}: los enlaces externos están apagados en esta superficie`, path)
}

const VERB_FIELDS: Record<string, { allowed: string[]; required: string[] }> = {
  navigate: { allowed: ['route'], required: ['route'] },
  invoke: { allowed: ['action', 'record', 'params', 'values'], required: ['action'] },
  submit: { allowed: ['form', 'to', 'action', 'model', 'record'], required: ['form', 'to'] },
  open: { allowed: ['overlay'], required: ['overlay'] },
  close: { allowed: ['overlay'], required: [] },
  set: { allowed: ['path', 'value'], required: ['path', 'value'] },
  refresh: { allowed: ['source'], required: ['source'] },
  emit: { allowed: ['id', 'params'], required: ['id'] },
}
const ACTION_COMMON = ['do', 'label', 'variant', 'icon', 'confirm', 'when']

function actionRule(a: Obj, path: string, doc: Obj) {
  const verb = a.do as string
  const spec = VERB_FIELDS[verb]
  if (!spec) throw new GenUIError('genui.enum', `${path}.do: verbo desconocido ${verb}`, path)
  for (const k of Object.keys(a)) {
    if (!ACTION_COMMON.includes(k) && !spec.allowed.includes(k)) throw new GenUIError('genui.field_not_allowed', `${path}.${k}: no aplica al verbo ${verb}`, `${path}.${k}`)
  }
  for (const k of spec.required) if (a[k] === undefined) throw new GenUIError('genui.invalid_action', `${path}: ${verb} requiere ${k}`, path)
  if (verb === 'navigate') {
    const r = a.route as Obj
    if (r.path !== undefined) {
      if (typeof r.path !== 'string' || !r.path.startsWith('/') || !isSafeLink(r.path)) throw new GenUIError('genui.unsafe_link', `${path}.route.path: solo rutas de la app`, path)
    } else if (r.name === 'record') {
      if (!r.model || r.id === undefined) throw new GenUIError('genui.invalid_action', `${path}: route record requiere model e id`, path)
    } else if (r.name === 'list') {
      if (!r.model) throw new GenUIError('genui.invalid_action', `${path}: route list requiere model`, path)
    } else if (r.name === 'page') {
      if (!r.key) throw new GenUIError('genui.invalid_action', `${path}: route page requiere key`, path)
    } else throw new GenUIError('genui.invalid_action', `${path}: route necesita path o name`, path)
  }
  if (verb === 'open' || (verb === 'close' && a.overlay !== undefined)) {
    if (!isObj(doc.overlays) || !(a.overlay as string in doc.overlays)) throw new GenUIError('genui.unknown_overlay', `${path}: overlay inexistente ${String(a.overlay)}`, path)
  }
  if (verb === 'submit') {
    const target = a.to as string
    if (target === 'invoke' && a.action === undefined) throw new GenUIError('genui.invalid_action', `${path}: submit→invoke requiere action`, path)
    if ((target === 'record.create' || target === 'record.update') && a.model === undefined) throw new GenUIError('genui.invalid_action', `${path}: ${target} requiere model`, path)
    if (target === 'record.update' && a.record === undefined) throw new GenUIError('genui.invalid_action', `${path}: record.update requiere record`, path)
  }
  if (verb === 'emit' && isObj(a.params)) {
    for (const [k, v] of Object.entries(a.params)) {
      if (isObj(v) && '$ref' in v) throw new GenUIError('genui.ref_not_allowed', `${path}.params.${k}: $ref no permitido en emit`, path)
    }
  }
  if (verb === 'set' && isObj(a.value)) throw new GenUIError('genui.type', `${path}.value: set solo escribe literales`, path)
  if (verb === 'refresh' && !(typeof a.source === 'string' && isObj(doc.data) && a.source in doc.data)) {
    throw new GenUIError('genui.unknown_target', `${path}: la fuente ${String(a.source)} no está declarada en data`, path)
  }
}

function stateRule(state: unknown) {
  if (state === undefined) return
  if (!isObj(state)) throw new GenUIError('genui.type', 'state debe ser un objeto', 'state')
  const keys = Object.keys(state)
  if (keys.length > 32) throw new GenUIError('genui.limit.properties', 'state: máximo 32 claves', 'state')
  const scalar = (x: unknown) => x === null || ['string', 'number', 'boolean'].includes(typeof x)
  for (const [k, v] of Object.entries(state)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(k)) throw new GenUIError('genui.pattern', `state.${k}: nombre inválido`, `state.${k}`)
    const ok =
      scalar(v) ||
      (Array.isArray(v) && v.length <= 50 && v.every(scalar)) ||
      (isObj(v) && Object.keys(v).length <= 16 && Object.values(v).every((x) => scalar(x) || (Array.isArray(x) && x.length <= 50 && x.every(scalar))))
    if (!ok) throw new GenUIError('genui.type', `state.${k}: solo escalares, listas o objetos de escalares`, `state.${k}`)
  }
}

/** Valida estrictamente un valor no confiable como documento genui/v2. Nunca lanza. */
export function parseUISpecV2(value: unknown, opts: ParseV2Options = {}): ParseV2Result {
  try {
    let v = value
    if (typeof v === 'string') {
      if (v.length > GENUI_V2_LIMITS.bytes) throw new GenUIError('genui.limit.bytes', `documento mayor a ${GENUI_V2_LIMITS.bytes} bytes`)
      try {
        v = JSON.parse(v)
      } catch {
        throw new GenUIError('genui.invalid_json', 'JSON inválido')
      }
    } else if (new TextEncoder().encode(JSON.stringify(v ?? null)).length > GENUI_V2_LIMITS.bytes) {
      throw new GenUIError('genui.limit.bytes', `documento mayor a ${GENUI_V2_LIMITS.bytes} bytes`)
    }
    if (!isObj(v)) throw new GenUIError('genui.invalid_document', 'el documento debe ser un objeto')
    if (v.version !== GENUI_V2_VERSION) throw new GenUIError('genui.unsupported_version', `version debe ser ${GENUI_V2_VERSION}`, 'version')
    const ctx: Ctx = { blockCount: 0, blockIds: new Map(), bindings: 0, actions: 0 }
    stateRule(v.state)
    forbidRefs(v, '$')
    // Los bloques de la raíz y de cada overlay están a profundidad 1.
    check(v, root, '$', ctx, 1)
    if (ctx.actions > GENUI_V2_LIMITS.actions) throw new GenUIError('genui.limit.actions', `máximo ${GENUI_V2_LIMITS.actions} acciones`)
    walk(v, '$', '', ctx, v, opts)
    return { ok: true, spec: v as unknown as UISpecV2 }
  } catch (e) {
    if (e instanceof GenUIError) return { ok: false, code: e.code, error: e.message, path: e.path }
    return { ok: false, code: 'genui.invalid_document', error: e instanceof Error ? e.message : String(e), path: '' }
  }
}
