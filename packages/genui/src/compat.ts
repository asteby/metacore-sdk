import { GenUIError, type GenUIErrorCode } from './errors'
import { GENUI_VERSION, type UISpec } from './types'
import { parseUISpec } from './validate'
import {
  FORBIDDEN_KEYS,
  GENUI_V2_VERSION,
  parseUISpecV2,
  prepareUntrusted,
  setOwn,
  validatePrepared,
  type ParseV2Options,
  type UISpecV2,
} from './validate-v2'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const has = (o: object, k: string) => Object.hasOwn(o, k)
const FORBIDDEN = new Set(FORBIDDEN_KEYS)

/** Bloques que existen con la misma forma en genui/v1. */
export const GENUI_V1_BLOCK_TYPES = ['text', 'kpi', 'card', 'table', 'links', 'timeline', 'chart', 'confirm'] as const

// `rows` y `params` llevan escalares donde null/'' sí significan algo: no se tocan.
const KEEP_VERBATIM = new Set(['rows', 'params'])

/** Quita campos vacíos que v1 toleraba ('' , null, listas vacías) y v2 estricto no. Nunca asigna claves de prototipo. */
function dropEmpty(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(dropEmpty)
  if (!isObj(v)) return v
  const out: Obj = {}
  for (const k of Object.keys(v)) {
    if (FORBIDDEN.has(k)) continue
    const x = v[k]
    if (x === undefined || x === null || x === '' || (Array.isArray(x) && x.length === 0)) continue
    setOwn(out, k, KEEP_VERBATIM.has(k) ? x : dropEmpty(x))
  }
  return out
}

function upgradeRaw(spec: Obj): Obj {
  const body = dropEmpty(spec) as Obj
  const out: Obj = {}
  setOwn(out, 'version', GENUI_V2_VERSION)
  for (const k of Object.keys(body)) if (k !== 'version') setOwn(out, k, body[k])
  return out
}

/**
 * genui/v1 → genui/v2. Identidad estructural: los 8 bloques de v1 existen en v2
 * con la misma forma; solo cambia `version` y se normalizan los campos vacíos
 * que el validador v1 toleraba. Espera un spec ya validado con `parseUISpec`;
 * no valida el resultado (usa `parseGenUI` para entrada no confiable).
 */
export function upgradeV1(spec: UISpec): UISpecV2 {
  return upgradeRaw(spec as unknown as Obj) as unknown as UISpecV2
}

export type ParseGenUIResult =
  | { ok: true; spec: UISpecV2; source: 'genui/v1' | 'genui/v2' }
  | { ok: false; code: GenUIErrorCode; error: string; path: string }

/**
 * Entrada única para specs no confiables de cualquier versión (equivalente de
 * `genui.ParseAny` en el kernel). Un v1 pasa por el validador v1 y, ya
 * actualizado, por el validador v2 estricto con las mismas opciones: un campo
 * extra que v1 toleraba o un enlace externo con `allowExternalLinks` apagado se
 * rechazan igual que en un v2 nativo. Devuelve siempre un v2 normalizado.
 */
export function parseGenUI(value: unknown, opts: ParseV2Options = {}): ParseGenUIResult {
  try {
    const v = prepareUntrusted(value)
    if (v.version === GENUI_VERSION) {
      const v1 = parseUISpec(v)
      const r2 = validatePrepared(upgradeRaw(v1.ok ? (v1.spec as unknown as Obj) : v), opts)
      if (!r2.ok) return r2
      if (!v1.ok) return { ok: false, code: 'genui.invalid_document', error: v1.error, path: '' }
      return { ok: true, spec: r2.spec, source: GENUI_VERSION }
    }
    const r = validatePrepared(v, opts)
    return r.ok ? { ok: true, spec: r.spec, source: GENUI_V2_VERSION } : r
  } catch (e) {
    if (e instanceof GenUIError) return { ok: false, code: e.code, error: e.message, path: e.path }
    return { ok: false, code: 'genui.invalid_document', error: e instanceof Error ? e.message : String(e), path: '' }
  }
}

/** Capacidades del cliente (lo que declara su `GenUIProvider`; `q:caps` las llevará al servidor). */
export interface GenUICaps {
  versions: string[]
  /** Bloques soportados (solo v2). Omitido = todos los del núcleo. */
  blocks?: string[]
  /** Verbos de acción soportados (solo v2; los `confirm` de v1 cuentan como `emit`). Omitido = todos. */
  verbs?: string[]
}

export interface DowngradeReport {
  /** Bloques sustituidos por su `fallback`. */
  replaced: number
  /** Bloques, acciones o campos descartados sin sustituto. */
  dropped: number
}

export type DowngradeResult =
  | { ok: true; spec: UISpecV2 | UISpec; report: DowngradeReport }
  | { ok: false; code: GenUIErrorCode; error: string }

const EMPTY_TEXT = 'Contenido no disponible en este cliente.'
const ACTION_KEYS = new Set(['actions', 'row_actions', 'bulk_actions', 'submit', 'action'])
// Claves cuyo contenido son datos, no estructura: nunca se interpretan como acciones.
const DATA_KEYS = new Set(['rows', 'inline', 'data', 'state', 'props', 'params', 'values', 'filters', 'args'])
const isActionObj = (x: unknown): x is Obj => isObj(x) && typeof x.do === 'string'

/**
 * Política de `Downgrade` (ADR 0001 del SDK, §2.5). La entrada se valida antes de
 * degradar. Cada bloque que el cliente no soporta se sustituye por su `fallback`
 * (bloque `text`); sin `fallback` se descarta, y un contenedor cuyos hijos se
 * descartan todos usa su propio `fallback` (o se descarta). Una acción con un
 * verbo no soportado, o que apunta a un overlay/formulario descartado, se
 * descarta (y no queda `actions: []`). Si el cliente solo habla v1, el resultado
 * es un documento genui/v1 válido: lo que v1 no puede representar (los bloques
 * nuevos, `when`, vinculaciones) sigue la misma regla de fallback/descarte; un
 * bloque con `when` nunca se muestra sin su condición. Sin `caps` se asume v1
 * (mientras `q:caps` no exista en ops). El resultado siempre se revalida.
 */
export function downgrade(input: UISpecV2, caps?: GenUICaps): DowngradeResult {
  const pre = parseUISpecV2(input, { allowExternalLinks: true })
  if (!pre.ok) return { ok: false, code: pre.code, error: pre.error }
  const spec = pre.spec as unknown as Obj

  const versions = caps?.versions?.length ? caps.versions : [GENUI_VERSION]
  const wantsV2 = versions.includes(GENUI_V2_VERSION)
  if (!wantsV2 && !versions.includes(GENUI_VERSION)) {
    return { ok: false, code: 'genui.unsupported_version', error: `el cliente no soporta ${versions.join(', ') || 'ninguna versión'}` }
  }
  const report: DowngradeReport = { replaced: 0, dropped: 0 }
  const blocks = caps?.blocks ? new Set(caps.blocks) : null
  const verbs = caps?.verbs ? new Set(caps.verbs) : null
  const verbOk = (verb: string) => !verbs || verbs.has(verb)

  const fallbackOf = (b: Obj): Obj | null => {
    if (typeof b.fallback !== 'string' || b.fallback === '') return null
    const t: Obj = { type: 'text', text: b.fallback }
    if (wantsV2) {
      if (has(b, 'id')) t.id = b.id
      if (has(b, 'when')) t.when = b.when
    }
    return t
  }
  const useFallback = (b: Obj, out: Obj[]) => {
    const fb = fallbackOf(b)
    if (fb) {
      report.replaced++
      out.push(fb)
    } else report.dropped++
  }

  // Quita, en todo el árbol, las acciones que `keep` rechaza; borra las listas que se quedan vacías.
  const filterActions = (v: unknown, key: string, keep: (a: Obj) => boolean): unknown => {
    if (Array.isArray(v)) {
      const isActs = ACTION_KEYS.has(key)
      const out: unknown[] = []
      for (const x of v) {
        if (isActs && isObj(x) && (isActionObj(x) || typeof (x as Obj).id === 'string')) {
          if (!keep(x)) {
            report.dropped++
            continue
          }
        }
        out.push(filterActions(x, key, keep))
      }
      return out
    }
    if (!isObj(v)) return v
    const out: Obj = {}
    for (const k of Object.keys(v)) {
      const x = v[k]
      if (DATA_KEYS.has(k)) {
        setOwn(out, k, x)
        continue
      }
      if (ACTION_KEYS.has(k) && isActionObj(x) && !keep(x)) {
        report.dropped++
        continue
      }
      const nx = filterActions(x, k, keep)
      if (Array.isArray(nx) && nx.length === 0 && ACTION_KEYS.has(k) && Array.isArray(x) && x.length > 0) continue
      setOwn(out, k, nx)
    }
    return out
  }
  const verbKeep = (a: Obj) => (isActionObj(a) ? verbOk(a.do as string) : verbOk('emit'))

  const v1Ok = (b: Obj): Obj | null => {
    // `when` no existe en v1: mostrar el bloque sin su condición cambiaría lo que ve la persona.
    if (has(b, 'when')) return null
    const rest: Obj = {}
    for (const k of Object.keys(b)) if (k !== 'id' && k !== 'fallback') setOwn(rest, k, b[k])
    if (!(GENUI_V1_BLOCK_TYPES as readonly string[]).includes(String(rest.type))) return null
    return parseUISpec({ version: GENUI_VERSION, blocks: [rest] }).ok ? rest : null
  }

  const mapBlocks = (list: unknown[], nested: boolean): Obj[] => {
    const out: Obj[] = []
    for (const raw of list) {
      const b = raw as Obj
      const type = String(b.type)
      const supported = (!blocks || blocks.has(type)) && !(type === 'confirm' && !verbOk('emit'))
      if (wantsV2 && supported) {
        let nb: Obj = { ...b }
        if (Array.isArray(b.blocks)) {
          const kids = mapBlocks(b.blocks, true)
          if (kids.length === 0) {
            useFallback(b, out)
            continue
          }
          nb = { ...nb, blocks: kids }
        }
        if (Array.isArray(b.tabs)) {
          const tabs = (b.tabs as Obj[]).map((t) => ({ ...t, blocks: mapBlocks(t.blocks as unknown[], true) })).filter((t) => t.blocks.length > 0)
          if (tabs.length === 0) {
            useFallback(b, out)
            continue
          }
          nb = { ...nb, tabs }
        }
        out.push(nb)
        continue
      }
      if (!wantsV2 && !nested && supported) {
        const v1 = v1Ok(filterActions(b, '', verbKeep) as Obj)
        if (v1) {
          out.push(v1)
          continue
        }
      }
      useFallback(b, out)
    }
    return out
  }

  let top = mapBlocks(spec.blocks as unknown[], false)
  if (!wantsV2 && top.length > 12) {
    report.dropped += top.length - 12
    top = top.slice(0, 12)
  }
  if (top.length === 0) top = [{ type: 'text', text: EMPTY_TEXT, tone: 'muted' }]

  if (!wantsV2) {
    const title = typeof spec.title === 'string' ? spec.title : undefined
    const out = { version: GENUI_VERSION, ...(title ? { title } : {}), blocks: top }
    const r = parseUISpec(out)
    return r.ok ? { ok: true, spec: r.spec, report } : { ok: false, code: 'genui.invalid_document', error: r.error }
  }

  let out: Obj = { ...spec, blocks: top }
  if (isObj(spec.overlays)) {
    const ov: Obj = {}
    for (const k of Object.keys(spec.overlays)) {
      const o = spec.overlays[k] as Obj
      const kids = mapBlocks(o.blocks as unknown[], true)
      if (kids.length) setOwn(ov, k, { ...o, blocks: kids })
    }
    if (Object.keys(ov).length) out.overlays = ov
    else delete out.overlays
  }
  // Formularios que sobreviven y overlays vivos: las acciones colgantes (open/close/submit) se podan.
  const liveForms = new Set<string>()
  const collect = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(collect)
    if (!isObj(v)) return
    if ((v.type === 'form' || v.type === 'wizard') && typeof v.id === 'string') liveForms.add(v.id)
    for (const k of Object.keys(v)) if (!DATA_KEYS.has(k)) collect(v[k])
  }
  collect(out.blocks)
  collect(out.overlays)
  const live = (isObj(out.overlays) ? out.overlays : {}) as Obj
  out = filterActions(out, '', (a) => {
    if (!isActionObj(a)) return verbOk('emit')
    if (!verbOk(a.do as string)) return false
    if (a.do === 'open') return has(live, a.overlay as string)
    if (a.do === 'close' && has(a, 'overlay')) return has(live, a.overlay as string)
    if (a.do === 'submit') return liveForms.has(a.form as string)
    return true
  }) as Obj
  const r = parseUISpecV2(out, { allowExternalLinks: true })
  if (!r.ok) return { ok: false, code: r.code, error: r.error }
  return { ok: true, spec: r.spec, report }
}
