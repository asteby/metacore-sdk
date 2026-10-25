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
 * Unidades: `bytes` son bytes UTF-8; las longitudes de texto son PUNTOS DE CÓDIGO.
 */
export const GENUI_V2_LIMITS = {
  bytes: 128 * 1024,
  /** Anidamiento máximo del JSON (objetos y listas), antes de cualquier recursión. */
  jsonDepth: 64,
  /** Profundidad máxima de bloques. */
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

const has = (o: object, k: string) => Object.hasOwn(o, k)
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const root = GENUI_V2_SCHEMA as unknown as Schema
const defs = root.$defs as Schema

/** Claves que jamás se aceptan en ningún objeto del documento. */
export const FORBIDDEN_KEYS: readonly string[] = ['__proto__', 'constructor', 'prototype']
const FORBIDDEN = new Set(FORBIDDEN_KEYS)

/** Asigna una clave propia sin tocar el prototipo (nunca `out[k] = v` con claves del documento). */
export function setOwn(o: Obj, k: string, v: unknown): void {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true })
}

/** Longitud en puntos de código (no unidades UTF-16): un emoji cuenta 1. */
function withinCodePoints(s: string, max: number): boolean {
  if (s.length <= max) return true
  let n = 0
  for (const _ of s) if (++n > max) return false
  return true
}

const utf8Bytes = (s: string) => new TextEncoder().encode(s).length

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
  markdown: 'genui.limit.markdown',
  actions: 'genui.limit.actions',
  row_actions: 'genui.limit.actions',
  bulk_actions: 'genui.limit.actions',
}

function resolve(s: Schema): Schema {
  let cur = s
  while (typeof cur.$ref === 'string' && cur.$ref.startsWith('#/$defs/')) {
    const next = defs[cur.$ref.slice(8)]
    if (!next) throw new Error(`esquema: ${cur.$ref} no existe`)
    cur = next
  }
  return cur
}

const kindOf = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v)
const matchesType = (t: unknown, v: unknown) => {
  const k = kindOf(v)
  const types = Array.isArray(t) ? t : [t]
  return types.some((x) => (x === 'number' || x === 'integer' ? k === 'number' && Number.isFinite(v) && (x === 'number' || Number.isInteger(v)) : x === k))
}

interface Ctx {
  doc: Obj
  opts: ParseV2Options
  blockCount: number
  blockIds: Map<string, string>
  bindings: number
  /** Acciones del documento y del bloque en curso (sin contar las de sus hijos). */
  actions: number
  cur: number
  submits: { form: string; path: string }[]
}

const lastKey = (path: string) => /([A-Za-z_]+)(\[\d+\])?$/.exec(path)?.[1] ?? ''

function sortedKeys(o: Obj, path: string): string[] {
  const keys = Object.keys(o).sort()
  // Los bloques se validan al final de la raíz: data/state/overlays ya están comprobados cuando un bloque los referencia.
  if (path === '$' && keys.includes('blocks')) return [...keys.filter((k) => k !== 'blocks'), 'blocks']
  return keys
}

/**
 * Intérprete mínimo del subconjunto de JSON Schema que usa genui-v2.schema.json
 * (la lista blanca de keywords la verifica el codegen y un test). Las reglas que
 * dependen de la POSICIÓN en el esquema (vinculaciones, enlaces, fuentes,
 * acciones) se aplican al terminar de validar el nodo, por el nombre del `$defs`
 * al que apunta, nunca por el nombre de la clave del dato.
 */
function check(value: unknown, schema: Schema, path: string, ctx: Ctx, depth: number): void {
  const refName = typeof schema.$ref === 'string' ? schema.$ref.slice(8) : undefined
  const s = resolve(schema)
  if (s['x-genui'] === 'block') return checkBlock(value, path, ctx, depth)

  // Un {"$ref": …} fuera de una posición de valor no es un valor: jamás se acepta.
  if (isObj(value) && has(value, '$ref') && (s.enum || s.const !== undefined || (s.type !== undefined && !matchesType(s.type, {})))) {
    throw new GenUIError('genui.ref_not_allowed', `${path}: $ref no permitido en esta posición`, path)
  }
  if (s.const !== undefined && value !== s.const) throw new GenUIError('genui.enum', `${path}: debe ser ${JSON.stringify(s.const)}`, path)
  if (s.enum && !s.enum.includes(value)) throw new GenUIError('genui.enum', `${path}: valor no permitido`, path)

  if (s['x-discriminator']) {
    const key = s['x-discriminator'] as string
    if (!isObj(value)) throw new GenUIError('genui.type', `${path}: se esperaba object, llegó ${kindOf(value)}`, path)
    if (!has(value, key)) throw new GenUIError('genui.required', `${path}: falta ${key}`, path)
    const alt = (s.oneOf as Schema[]).find((a) => {
      const c = resolve(a).properties?.[key]?.const
      return c !== undefined && c === value[key]
    })
    if (!alt) throw new GenUIError('genui.enum', `${path}.${key}: valor no permitido`, `${path}.${key}`)
    check(value, alt, path, ctx, depth)
  } else if (s.anyOf || s.oneOf) {
    const alts: Schema[] = s.anyOf ?? s.oneOf
    const errors: (GenUIError | null)[] = []
    let ok = 0
    for (const alt of alts) {
      const snap = { bindings: ctx.bindings, actions: ctx.actions, cur: ctx.cur, submits: ctx.submits.length }
      try {
        check(value, alt, path, ctx, depth)
        ok++
        errors.push(null)
        if (s.anyOf) break
      } catch (e) {
        if (!(e instanceof GenUIError)) throw e
        // Cada alternativa corre aislada: lo que contó una alternativa fallida no cuenta.
        ctx.bindings = snap.bindings
        ctx.actions = snap.actions
        ctx.cur = snap.cur
        ctx.submits.length = snap.submits
        errors.push(e)
      }
    }
    if (s.oneOf && ok > 1) throw new GenUIError('genui.invalid_block', `${path}: coincide con más de una alternativa`, path)
    if (ok === 0) {
      const idx = alts.findIndex((a) => {
        const r = resolve(a)
        if (!r.type || !matchesType(r.type, value)) return false
        return !isObj(value) || !r.required || r.required.every((k: string) => has(value, k))
      })
      const typed = idx >= 0 ? idx : alts.findIndex((a) => resolve(a).type && matchesType(resolve(a).type, value))
      if (typed < 0) throw new GenUIError('genui.type', `${path}: tipo inválido (${kindOf(value)})`, path)
      throw errors[typed]!
    }
  }

  if (s.type !== undefined && !matchesType(s.type, value)) {
    throw new GenUIError('genui.type', `${path}: se esperaba ${([] as string[]).concat(s.type).join('|')}, llegó ${kindOf(value)}`, path)
  }
  if (typeof value === 'string') {
    if (s.maxLength !== undefined && !withinCodePoints(value, s.maxLength)) {
      throw new GenUIError(s['x-error'] ?? (lastKey(path) === 'markdown' ? 'genui.limit.markdown' : 'genui.limit.length'), `${path}: excede ${s.maxLength} caracteres`, path)
    }
    if (s.pattern && !new RegExp(s.pattern, 'u').test(value)) throw new GenUIError(s['x-error'] ?? 'genui.pattern', `${path}: formato inválido`, path)
  } else if (typeof value === 'number') {
    if ((s.minimum !== undefined && value < s.minimum) || (s.maximum !== undefined && value > s.maximum)) {
      throw new GenUIError('genui.type', `${path}: fuera de rango ${s.minimum ?? ''}..${s.maximum ?? ''}`, path)
    }
  } else if (Array.isArray(value)) {
    if (s.maxItems !== undefined && value.length > s.maxItems) throw new GenUIError(LIMIT_BY_KEY[lastKey(path)] ?? 'genui.limit.items', `${path}: máximo ${s.maxItems} elementos`, path)
    if (s.minItems !== undefined && value.length < s.minItems) throw new GenUIError('genui.required', `${path}: mínimo ${s.minItems} elementos`, path)
    if (s.items) value.forEach((v, i) => check(v, s.items, `${path}[${i}]`, ctx, depth))
  } else if (isObj(value)) {
    const keys = sortedKeys(value, path)
    if (s.maxProperties !== undefined && keys.length > s.maxProperties) {
      throw new GenUIError(LIMIT_BY_KEY[lastKey(path)] ?? 'genui.limit.properties', `${path}: demasiadas propiedades (máx. ${s.maxProperties})`, path)
    }
    if (s.minProperties !== undefined && keys.length < s.minProperties) throw new GenUIError('genui.required', `${path}: faltan propiedades`, path)
    for (const r of s.required ?? []) if (!has(value, r)) throw new GenUIError('genui.required', `${path}: falta ${r}`, path)
    for (const k of keys) {
      const sub = `${path}.${k}`
      if (s.propertyNames?.pattern && !new RegExp(s.propertyNames.pattern, 'u').test(k)) throw new GenUIError('genui.pattern', `${sub}: nombre inválido`, sub)
      if (s.properties && has(s.properties, k)) check(value[k], s.properties[k], sub, ctx, depth)
      else if (s.additionalProperties === false) throw new GenUIError('genui.field_not_allowed', `${sub}: campo no permitido`, sub)
      else if (isObj(s.additionalProperties)) check(value[k], s.additionalProperties, sub, ctx, depth)
    }
  }

  // Reglas por posición en el esquema (después de validar la forma del nodo).
  switch (refName) {
    case 'action':
      if (++ctx.actions > GENUI_V2_LIMITS.actions) throw new GenUIError('genui.limit.actions', `máximo ${GENUI_V2_LIMITS.actions} acciones`, path)
      ctx.cur++
      actionRule(value as Obj, path, ctx)
      break
    case 'ref':
      if (++ctx.bindings > GENUI_V2_LIMITS.bindings) throw new GenUIError('genui.limit.bindings', `máximo ${GENUI_V2_LIMITS.bindings} vinculaciones`, path)
      break
    case 'bindingPath':
      refRule(value as string, path, ctx)
      break
    case 'source':
      if (!isObj(ctx.doc.data) || !has(ctx.doc.data, (value as string).slice(5))) {
        throw new GenUIError('genui.unknown_target', `${path}: la fuente ${value} no está declarada en data`, path)
      }
      break
    case 'link':
      if (!(value as string).startsWith('/') && !ctx.opts.allowExternalLinks) {
        throw new GenUIError('genui.external_link_disabled', `${path}: los enlaces externos están apagados en esta superficie`, path)
      }
      if (!isSafeLink(value)) throw new GenUIError('genui.unsafe_link', `${path}: enlace no seguro`, path)
      break
  }
}

function checkBlock(raw: unknown, path: string, ctx: Ctx, depth: number): void {
  if (depth > GENUI_V2_LIMITS.depth) throw new GenUIError('genui.limit.depth', `${path}: profundidad máxima ${GENUI_V2_LIMITS.depth}`, path)
  if (!isObj(raw)) throw new GenUIError('genui.type', `${path}: el bloque debe ser un objeto`, path)
  const type = raw.type
  if (typeof type !== 'string' || !has(GENUI_V2_BLOCKS, type)) throw new GenUIError('genui.unknown_block', `${path}: tipo de bloque desconocido ${String(type)}`, path)
  if (++ctx.blockCount > GENUI_V2_LIMITS.blocks) throw new GenUIError('genui.limit.blocks', `máximo ${GENUI_V2_LIMITS.blocks} bloques`, path)
  const id = raw.id
  if (typeof id === 'string') {
    if (ctx.blockIds.has(id)) throw new GenUIError('genui.duplicate_id', `${path}: id duplicado ${id}`, `${path}.id`)
    ctx.blockIds.set(id, type)
  }
  const outer = ctx.cur
  ctx.cur = 0
  // El esquema del bloque valida sus campos; los hijos (x-genui) vuelven a checkBlock con depth+1.
  check(raw, defs[`block_${type}`], path, ctx, depth + 1)
  const own = ctx.cur
  ctx.cur = outer
  if (own > GENUI_V2_LIMITS.actionsPerBlock) throw new GenUIError('genui.limit.actions', `${path}: máximo ${GENUI_V2_LIMITS.actionsPerBlock} acciones por bloque`, path)
  blockRules(raw, type, path)
}

function blockRules(b: Obj, type: string, path: string) {
  const L = GENUI_V2_LIMITS
  const present = (k: string) => has(b, k)
  if (type === 'table') {
    const cols = (b.columns as unknown[]).length
    if (present('source')) {
      if (present('rows')) throw new GenUIError('genui.invalid_block', `${path}: table usa rows o source, no ambos`, path)
      if (cols > L.sourceTableColumns) throw new GenUIError('genui.limit.columns', `${path}: máximo ${L.sourceTableColumns} columnas con source`, path)
    } else if (cols > L.inlineTableColumns) {
      throw new GenUIError('genui.limit.columns', `${path}: máximo ${L.inlineTableColumns} columnas en línea`, path)
    } else if (present('rows') && (b.rows as unknown[]).length > L.inlineTableRows) {
      throw new GenUIError('genui.limit.rows', `${path}: máximo ${L.inlineTableRows} filas en línea`, path)
    }
  }
  if (type === 'chart' && present('source') && present('rows')) throw new GenUIError('genui.invalid_block', `${path}: chart usa rows o source, no ambos`, path)
  if ((type === 'stats' || type === 'timeline') && present('source') && present('items')) throw new GenUIError('genui.invalid_block', `${path}: ${type} usa items o source, no ambos`, path)
  if ((type === 'stats' || type === 'timeline') && !present('source') && !present('items')) throw new GenUIError('genui.required', `${path}: ${type} requiere items o source`, path)
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
    const hasFields = ((b.fields as unknown[] | undefined) ?? []).length > 0
    if (type === 'form' && (b.layout as Obj | undefined)?.mode === 'steps' && !steps?.length) throw new GenUIError('genui.required', `${path}: layout.mode steps requiere steps`, path)
    if (type === 'form' && !hasFields) throw new GenUIError('genui.required', `${path}: form requiere fields`, path)
    if (type === 'wizard' && !present('ref') && !(steps?.length && hasFields)) throw new GenUIError('genui.required', `${path}: wizard requiere steps y fields, o ref`, path)
  }
}

const CTX_KEYS = new Set(['locale', 'currency', 'time_zone', 'branch_id'])

function refRule(ref: string, path: string, ctx: Ctx) {
  const parts = ref.split('.')
  if (parts[0] === 'ctx' && (parts.length !== 2 || !CTX_KEYS.has(parts[1]!))) throw new GenUIError('genui.bad_ref', `${path}: ctx solo expone ${[...CTX_KEYS].join(', ')}`, path)
  if (parts[0] === 'data' && (!isObj(ctx.doc.data) || !has(ctx.doc.data, parts[1]!))) {
    throw new GenUIError('genui.bad_ref', `${path}: la fuente ${parts[1]} no está declarada en data`, path)
  }
}

/** Reglas de acción que el esquema por verbo no expresa. */
function actionRule(a: Obj, path: string, ctx: Ctx) {
  const verb = a.do as string
  const overlays = ctx.doc.overlays
  if (verb === 'navigate') {
    const r = a.route as Obj
    if (has(r, 'path')) {
      if (has(r, 'name') || has(r, 'model') || has(r, 'id') || has(r, 'filters') || has(r, 'key')) throw new GenUIError('genui.invalid_action', `${path}: route usa path o name, no ambos`, path)
    } else if (r.name === 'record') {
      if (!has(r, 'model') || !has(r, 'id')) throw new GenUIError('genui.invalid_action', `${path}: route record requiere model e id`, path)
    } else if (r.name === 'list') {
      if (!has(r, 'model')) throw new GenUIError('genui.invalid_action', `${path}: route list requiere model`, path)
    } else if (r.name === 'page') {
      if (!has(r, 'key')) throw new GenUIError('genui.invalid_action', `${path}: route page requiere key`, path)
    } else {
      throw new GenUIError('genui.invalid_action', `${path}: route necesita path o name`, path)
    }
  }
  if ((verb === 'open' || (verb === 'close' && has(a, 'overlay'))) && !(isObj(overlays) && has(overlays, a.overlay as string))) {
    throw new GenUIError('genui.unknown_overlay', `${path}: overlay inexistente ${String(a.overlay)}`, path)
  }
  if (verb === 'refresh' && !(isObj(ctx.doc.data) && has(ctx.doc.data, a.source as string))) {
    throw new GenUIError('genui.unknown_target', `${path}: la fuente ${String(a.source)} no está declarada en data`, path)
  }
  if (verb === 'submit') ctx.submits.push({ form: a.form as string, path })
}

/**
 * Prelude iterativa (sin recursión) sobre el valor ya parseado: anidamiento
 * máximo, números no finitos y claves de prototipo. Va antes de cualquier
 * recursión (JSON.stringify, validación, upgrade).
 */
function scan(root: unknown): void {
  const stack: [unknown, number][] = [[root, 1]]
  let nodes = 0
  while (stack.length) {
    const [v, d] = stack.pop()!
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw new GenUIError('genui.invalid_json', 'número fuera de rango')
      continue
    }
    if (typeof v !== 'object' || v === null) continue
    if (d > GENUI_V2_LIMITS.jsonDepth) throw new GenUIError('genui.limit.depth', `anidamiento JSON mayor a ${GENUI_V2_LIMITS.jsonDepth}`)
    if (++nodes > 1_000_000) throw new GenUIError('genui.limit.bytes', 'documento demasiado grande')
    if (Array.isArray(v)) {
      for (const x of v) stack.push([x, d + 1])
    } else {
      for (const k of Object.keys(v)) {
        if (FORBIDDEN.has(k)) throw new GenUIError('genui.forbidden_key', `clave prohibida ${k}`, k)
        stack.push([(v as Obj)[k], d + 1])
      }
    }
  }
}

/** Anidamiento del texto JSON, sin parsearlo (iterativo; ignora lo que va entre comillas). */
function scanText(text: string): void {
  let depth = 0
  let inStr = false
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (inStr) {
      if (c === 92) i++
      else if (c === 34) inStr = false
    } else if (c === 34) inStr = true
    else if (c === 91 || c === 123) {
      if (++depth > GENUI_V2_LIMITS.jsonDepth) throw new GenUIError('genui.limit.depth', `anidamiento JSON mayor a ${GENUI_V2_LIMITS.jsonDepth}`)
    } else if (c === 93 || c === 125) depth--
  }
}

/**
 * Primera fase común a v1 y v2: texto/objeto no confiable -> objeto seguro
 * (bytes UTF-8, anidamiento, claves prohibidas, números finitos).
 * Orden de las fases de validación (documentado en conformance/README.md):
 *   1 bytes (texto) · 2 anidamiento (texto) · 3 JSON.parse · 4 anidamiento/claves/números (objeto)
 *   · 5 bytes (objeto) · 6 objeto + version · 7 esquema y reglas por posición · 8 reglas globales.
 */
export function prepareUntrusted(value: unknown): Obj {
  let v = value
  if (typeof v === 'string') {
    if (v.length > GENUI_V2_LIMITS.bytes || utf8Bytes(v) > GENUI_V2_LIMITS.bytes) throw new GenUIError('genui.limit.bytes', `documento mayor a ${GENUI_V2_LIMITS.bytes} bytes`)
    scanText(v)
    try {
      v = JSON.parse(v)
    } catch {
      throw new GenUIError('genui.invalid_json', 'JSON inválido')
    }
    scan(v)
  } else {
    scan(v)
    let text: string | undefined
    try {
      text = JSON.stringify(v ?? null)
    } catch {
      throw new GenUIError('genui.invalid_document', 'el documento no es serializable')
    }
    if (text === undefined || utf8Bytes(text) > GENUI_V2_LIMITS.bytes) throw new GenUIError('genui.limit.bytes', `documento mayor a ${GENUI_V2_LIMITS.bytes} bytes`)
  }
  if (!isObj(v)) throw new GenUIError('genui.invalid_document', 'el documento debe ser un objeto')
  return v
}

const failure = (e: unknown): { ok: false; code: GenUIErrorCode; error: string; path: string } =>
  e instanceof GenUIError
    ? { ok: false, code: e.code, error: e.message, path: e.path }
    : { ok: false, code: 'genui.invalid_document', error: e instanceof Error ? e.message : String(e), path: '' }

/** Valida estrictamente un valor no confiable como documento genui/v2. Nunca lanza. */
export function parseUISpecV2(value: unknown, opts: ParseV2Options = {}): ParseV2Result {
  try {
    const v = prepareUntrusted(value)
    return validatePrepared(v, opts)
  } catch (e) {
    return failure(e)
  }
}

/** Valida un objeto que ya pasó `prepareUntrusted` (uso interno de compat). */
export function validatePrepared(v: Obj, opts: ParseV2Options = {}): ParseV2Result {
  try {
    if (v.version !== GENUI_V2_VERSION) throw new GenUIError('genui.unsupported_version', `version debe ser ${GENUI_V2_VERSION}`, 'version')
    const ctx: Ctx = { doc: v, opts, blockCount: 0, blockIds: new Map(), bindings: 0, actions: 0, cur: 0, submits: [] }
    // Los bloques de la raíz y de cada overlay están a profundidad 1.
    check(v, root, '$', ctx, 1)
    for (const s of ctx.submits) {
      const t = ctx.blockIds.get(s.form)
      if (t !== 'form' && t !== 'wizard') throw new GenUIError('genui.unknown_target', `${s.path}: submit apunta a ${s.form}, que no es un bloque form/wizard del documento`, s.path)
    }
    return { ok: true, spec: v as unknown as UISpecV2 }
  } catch (e) {
    return failure(e)
  }
}
