import { GenUIError, type GenUIErrorCode } from './errors'
import { GENUI_VERSION, type UISpec } from './types'
import { parseUISpec } from './validate'
import { GENUI_V2_LIMITS, GENUI_V2_VERSION, parseUISpecV2, type ParseV2Options, type UISpecV2 } from './validate-v2'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Bloques que existen con la misma forma en genui/v1. */
export const GENUI_V1_BLOCK_TYPES = ['text', 'kpi', 'card', 'table', 'links', 'timeline', 'chart', 'confirm'] as const

// `rows` y `params` llevan escalares donde null/'' sí significan algo: no se tocan.
const KEEP_VERBATIM = new Set(['rows', 'params'])

/** Quita campos vacíos que v1 toleraba ('' , null, listas vacías) y v2 estricto no. */
function dropEmpty(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(dropEmpty)
  if (!isObj(v)) return v
  const out: Obj = {}
  for (const [k, x] of Object.entries(v)) {
    if (x === undefined || x === null || x === '' || (Array.isArray(x) && x.length === 0)) continue
    out[k] = KEEP_VERBATIM.has(k) ? x : dropEmpty(x)
  }
  return out
}

/**
 * genui/v1 → genui/v2. Identidad estructural: los 8 bloques de v1 existen en v2
 * con la misma forma; solo cambia `version` y se normalizan los campos vacíos
 * que el validador v1 toleraba. Espera un spec ya validado con `parseUISpec`.
 */
export function upgradeV1(spec: UISpec): UISpecV2 {
  const { version: _v, ...rest } = dropEmpty(spec) as Obj
  void _v
  return { version: GENUI_V2_VERSION, ...rest } as unknown as UISpecV2
}

export type ParseGenUIResult =
  | { ok: true; spec: UISpecV2; source: 'genui/v1' | 'genui/v2' }
  | { ok: false; code: GenUIErrorCode; error: string; path: string }

/**
 * Entrada única para specs no confiables de cualquier versión: valida v1 con el
 * validador v1 (sin cambios) o v2 con el estricto, y devuelve siempre un v2
 * normalizado (equivalente de `genui.ParseAny` en el kernel).
 */
export function parseGenUI(value: unknown, opts: ParseV2Options = {}): ParseGenUIResult {
  let v = value
  if (typeof v === 'string') {
    if (v.length > GENUI_V2_LIMITS.bytes) return { ok: false, code: 'genui.limit.bytes', error: 'documento demasiado grande', path: '' }
    try {
      v = JSON.parse(v)
    } catch {
      return { ok: false, code: 'genui.invalid_json', error: 'JSON inválido', path: '' }
    }
  }
  if (!isObj(v)) return { ok: false, code: 'genui.invalid_document', error: 'el documento debe ser un objeto', path: '' }
  if (v.version === GENUI_VERSION) {
    const r = parseUISpec(v)
    if (!r.ok) return { ok: false, code: 'genui.invalid_document', error: r.error, path: '' }
    return { ok: true, spec: upgradeV1(r.spec), source: GENUI_VERSION }
  }
  const r = parseUISpecV2(v, opts)
  return r.ok ? { ok: true, spec: r.spec, source: GENUI_V2_VERSION } : r
}

/** Capacidades del cliente (lo que declara su `GenUIProvider`; `q:caps` las llevará al servidor). */
export interface GenUICaps {
  versions: string[]
  /** Bloques soportados (solo v2). Omitido = todos los del núcleo. */
  blocks?: string[]
  /** Verbos de acción soportados (solo v2). Omitido = todos. */
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

/**
 * Política de `Downgrade` (ADR 0001 del SDK, §2.5). Cada bloque que el cliente no
 * soporta se sustituye por su `fallback` (bloque `text`); sin `fallback` se
 * descarta (y un contenedor que se queda sin hijos también). Una acción con un
 * verbo no soportado se descarta. Si el cliente solo habla v1, el resultado es
 * un documento genui/v1 válido: los bloques fuera de los 8 de v1 (o que no
 * validan como v1 al quitarles `id`/`when`/`fallback`) siguen la misma regla.
 * Sin `caps` se asume genui/v1 (mientras `q:caps` no exista en ops). El
 * resultado siempre se revalida; nunca devuelve un documento inválido.
 */
export function downgrade(spec: UISpecV2, caps?: GenUICaps): DowngradeResult {
  const versions = caps?.versions?.length ? caps.versions : [GENUI_VERSION]
  const wantsV2 = versions.includes(GENUI_V2_VERSION)
  if (!wantsV2 && !versions.includes(GENUI_VERSION)) {
    return { ok: false, code: 'genui.unsupported_version', error: `el cliente no soporta ${versions.join(', ') || 'ninguna versión'}` }
  }
  const report: DowngradeReport = { replaced: 0, dropped: 0 }
  const blocks = caps?.blocks ? new Set(caps.blocks) : null
  const verbs = caps?.verbs ? new Set(caps.verbs) : null

  const fallbackOf = (b: Obj): Obj | null => {
    if (typeof b.fallback !== 'string' || b.fallback === '') return null
    const t: Obj = { type: 'text', text: b.fallback }
    if (wantsV2) {
      if (b.id !== undefined) t.id = b.id
      if (b.when !== undefined) t.when = b.when
    }
    return t
  }

  const stripActions = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      const kept = v.filter((x) => !(isObj(x) && typeof x.do === 'string' && verbs && !verbs.has(x.do)))
      report.dropped += v.length - kept.length
      return kept.map(stripActions)
    }
    if (!isObj(v)) return v
    const out: Obj = {}
    for (const [k, x] of Object.entries(v)) {
      if (isObj(x) && typeof x.do === 'string' && verbs && !verbs.has(x.do)) {
        report.dropped++
        continue
      }
      out[k] = k === 'blocks' ? x : stripActions(x)
    }
    return out
  }

  const v1Ok = (b: Obj): Obj | null => {
    const { id: _i, when: _w, fallback: _f, ...rest } = b
    void _i; void _w; void _f
    if (!(GENUI_V1_BLOCK_TYPES as readonly string[]).includes(String(rest.type))) return null
    return parseUISpec({ version: GENUI_VERSION, blocks: [rest] }).ok ? rest : null
  }

  const mapBlocks = (list: unknown[], nested: boolean): Obj[] => {
    const out: Obj[] = []
    for (const raw of list) {
      const b = raw as Obj
      const type = String(b.type)
      const supported = !blocks || blocks.has(type)
      if (wantsV2 && supported) {
        let nb = stripActions(b) as Obj
        if (Array.isArray(b.blocks)) {
          const kids = mapBlocks(b.blocks, true)
          if (kids.length === 0) { report.dropped++; continue }
          nb = { ...nb, blocks: kids }
        }
        if (Array.isArray(b.tabs)) {
          const tabs = (b.tabs as Obj[]).map((t) => ({ ...t, blocks: mapBlocks(t.blocks as unknown[], true) })).filter((t) => t.blocks.length > 0)
          if (tabs.length === 0) { report.dropped++; continue }
          nb = { ...nb, tabs }
        }
        out.push(nb)
        continue
      }
      if (!wantsV2 && !nested && supported) {
        const v1 = v1Ok(stripActions(b) as Obj)
        if (v1) { out.push(v1); continue }
      }
      const fb = fallbackOf(b)
      if (fb) { report.replaced++; out.push(fb) } else report.dropped++
    }
    return out
  }

  let top = mapBlocks(spec.blocks, false)
  if (!wantsV2 && top.length > 12) {
    report.dropped += top.length - 12
    top = top.slice(0, 12)
  }
  if (top.length === 0) top = [{ type: 'text', text: EMPTY_TEXT, tone: 'muted' }]

  let out: Obj
  if (wantsV2) {
    out = { ...spec, blocks: top }
    if (isObj(spec.overlays)) {
      const ov: Obj = {}
      for (const [k, o] of Object.entries(spec.overlays)) {
        const kids = mapBlocks(o.blocks as unknown[], true)
        if (kids.length) ov[k] = { ...o, blocks: kids }
      }
      if (Object.keys(ov).length) out.overlays = ov
      else delete out.overlays
    }
    // Una acción `open` hacia un overlay descartado deja de ser válida: se quita.
    const live = (out.overlays ?? {}) as Obj
    const prune = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.filter((x) => !(isObj(x) && x.do === 'open' && !(x.overlay as string in live))).map(prune)
      if (!isObj(v)) return v
      const o: Obj = {}
      for (const [k, x] of Object.entries(v)) {
        if (isObj(x) && x.do === 'open' && !(x.overlay as string in live)) { report.dropped++; continue }
        o[k] = prune(x)
      }
      return o
    }
    out = prune(out) as Obj
    const r = parseUISpecV2(out, { allowExternalLinks: true })
    if (!r.ok) return { ok: false, code: r.code, error: r.error }
    return { ok: true, spec: r.spec, report }
  }

  const title = typeof spec.title === 'string' ? spec.title : undefined
  out = { version: GENUI_VERSION, ...(title ? { title } : {}), blocks: top }
  const r = parseUISpec(out)
  if (!r.ok) return { ok: false, code: 'genui.invalid_document', error: r.error }
  return { ok: true, spec: r.spec, report }
}

