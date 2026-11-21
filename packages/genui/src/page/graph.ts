// Grafo de bloques de pagina (`genui.page-graph/v1`): la pagina como DATOS.
//
// Un arbol de nodos con id estable, props, hijos ordenados y condiciones de
// visibilidad (permiso, ajuste, predicado de estado). Es el formato sobre el que
// un OVERLAY (parches declarativos: anadir, quitar, reordenar, reconfigurar,
// reemplazar con fallback) se aplica; la funcion de fusion NO vive aqui: este
// modulo solo valida, indexa y compila el grafo a los `PageBlockDef` que ya pinta
// `PageView`. Logica pura, sin React ni DOM.
import type { PageBlockDef } from './blocks'
import { evalPredicate } from './context'

export const PAGE_GRAPH_VERSION = 'genui.page-graph/v1' as const

export const PAGE_GRAPH_LIMITS = { nodes: 500, depth: 8, children: 64, bytes: 256 * 1024 } as const

/** Predicado de estado dinamico (`when`): se evalua en cada render con `state`, `data` y `ctx`. */
export interface GraphPredicate {
  ref: string
  equals?: unknown
  in?: unknown[]
  not_in?: unknown[]
  empty?: boolean
}

/** Condicion sobre un ajuste de la organizacion (`settings[key]`). Estatica: se resuelve al compilar. */
export interface GraphSettingCondition {
  key: string
  equals?: unknown
  in?: unknown[]
  not_in?: unknown[]
  empty?: boolean
}

/** Todo lo declarado debe cumplirse (AND). Sin nada declarado el nodo es visible. */
export interface GraphVisibility {
  /** Permiso efectivo (`can`). Estatico. */
  permission?: string
  /** Ajuste de la organizacion/preset. Estatico. */
  setting?: GraphSettingCondition
  /** Predicado de estado. Dinamico. */
  when?: GraphPredicate
}

export interface GraphNode {
  /** Estable entre versiones: es la direccion que usan los overlays. */
  id: string
  /** Tipo de bloque (`grid`, `section`, `tabs`, `tab`, `kpi_card`, `stats`, `map`, `ext`...). */
  type: string
  /** Campos propios del bloque (todo menos estructura). Nunca `type`, `id`, `blocks`, `tabs`, `when`, `area`. */
  props?: Record<string, unknown>
  /** Hijos ordenados. En `tabs` solo nodos `tab`; en `tab`, `section` y `grid` son los bloques de esa vista. */
  children?: GraphNode[]
  /** Area de la cuadricula del padre (`grid.areas`). */
  area?: string
  visible?: GraphVisibility
  /** Texto si el bloque no se puede pintar (tipo desconocido, componente no registrado). */
  fallback?: string
  /** Nodo que se pinta si ESTE falla al renderizar (p. ej. el original que un overlay reemplazo). */
  fallback_node?: GraphNode
  /** Quien lo aporto (`base`, `preset:7leguas`, `addon:foo@1.2`): para Explain; no cambia el render. */
  origin?: string
}

export interface PageGraph {
  version: typeof PAGE_GRAPH_VERSION
  /** Id de la pagina (p. ej. `dashboard`, `pos.sale`). */
  id: string
  title?: unknown
  /** Estado inicial de la pagina (`state.*`). */
  state?: Record<string, unknown>
  /** Fuentes declaradas (`data.*`), igual que en `ui.data` de genui/v2. */
  data?: Record<string, unknown>
  root: GraphNode[]
}

export const GRAPH_ERROR_CODES = [
  'page_graph.version',
  'page_graph.shape',
  'page_graph.id_invalid',
  'page_graph.id_duplicate',
  'page_graph.type_invalid',
  'page_graph.props_reserved',
  'page_graph.forbidden_key',
  'page_graph.tab_parent',
  'page_graph.visibility',
  'page_graph.limit.nodes',
  'page_graph.limit.depth',
  'page_graph.limit.children',
  'page_graph.limit.bytes',
] as const
export type GraphErrorCode = (typeof GRAPH_ERROR_CODES)[number]

export interface GraphError {
  code: GraphErrorCode
  /** Ruta JSON (`root[0].children[2]`). */
  path: string
  /** Id del nodo afectado, si lo hay. */
  id?: string
  message: string
}

const ID = /^[A-Za-z][A-Za-z0-9_.:-]{0,95}$/
const TYPE = /^[a-z][a-z0-9_]{0,31}$/
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype'])
/** Claves estructurales que `props` no puede traer (las gobierna el nodo). */
const RESERVED = new Set(['type', 'id', 'blocks', 'tabs', 'when', 'area', 'fallback', 'visible'])

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

export type ParseGraphResult = { ok: true; graph: PageGraph } | { ok: false; errors: GraphError[] }

/** Busca llaves de prototipo en cualquier profundidad (acotado). */
function hasForbiddenKey(v: unknown, depth = 0): boolean {
  if (depth > 32 || v === null || typeof v !== 'object') return false
  if (Array.isArray(v)) return v.some((x) => hasForbiddenKey(x, depth + 1))
  for (const k of Object.keys(v)) if (FORBIDDEN.has(k) || hasForbiddenKey((v as Record<string, unknown>)[k], depth + 1)) return true
  return false
}

function checkVisibility(v: unknown, path: string, id: string | undefined, errors: GraphError[]): void {
  if (v === undefined) return
  const bad = (message: string): void => void errors.push({ code: 'page_graph.visibility', path, id, message })
  if (!isObj(v)) return bad('visible debe ser un objeto')
  for (const k of Object.keys(v)) if (!['permission', 'setting', 'when'].includes(k)) bad(`visible.${k} no existe (permission | setting | when)`)
  if (v.permission !== undefined && (typeof v.permission !== 'string' || !v.permission)) bad('visible.permission debe ser un texto')
  if (v.setting !== undefined && (!isObj(v.setting) || typeof v.setting.key !== 'string' || !v.setting.key)) bad('visible.setting requiere key')
  if (v.when !== undefined && (!isObj(v.when) || typeof v.when.ref !== 'string' || !/^(state|ctx|data)\./.test(v.when.ref))) bad('visible.when requiere ref state.* | ctx.* | data.*')
}

/**
 * Valida un grafo de pagina. Nunca lanza: devuelve TODOS los errores (codigos estables
 * `page_graph.*`) para que un panel de administracion los muestre. No muta la entrada.
 */
export function parsePageGraph(input: unknown): ParseGraphResult {
  const errors: GraphError[] = []
  if (!isObj(input)) return { ok: false, errors: [{ code: 'page_graph.shape', path: '', message: 'el grafo debe ser un objeto' }] }
  if (input.version !== PAGE_GRAPH_VERSION) errors.push({ code: 'page_graph.version', path: 'version', message: `version debe ser ${PAGE_GRAPH_VERSION}` })
  if (typeof input.id !== 'string' || !ID.test(input.id)) errors.push({ code: 'page_graph.id_invalid', path: 'id', message: 'id de pagina invalido' })
  if (!Array.isArray(input.root)) {
    errors.push({ code: 'page_graph.shape', path: 'root', message: 'root debe ser una lista de nodos' })
    return { ok: false, errors }
  }
  let bytes = 0
  try {
    bytes = new TextEncoder().encode(JSON.stringify(input)).length
  } catch {
    errors.push({ code: 'page_graph.shape', path: '', message: 'el grafo no es JSON serializable' })
    return { ok: false, errors }
  }
  if (bytes > PAGE_GRAPH_LIMITS.bytes) errors.push({ code: 'page_graph.limit.bytes', path: '', message: `maximo ${PAGE_GRAPH_LIMITS.bytes} bytes` })
  if (hasForbiddenKey(input)) errors.push({ code: 'page_graph.forbidden_key', path: '', message: 'llaves de prototipo no permitidas' })
  if (errors.some((e) => e.code === 'page_graph.forbidden_key' || e.code === 'page_graph.limit.bytes')) return { ok: false, errors }

  const seen = new Set<string>()
  let count = 0
  const walk = (nodes: unknown[], path: string, depth: number, parentType: string | undefined) => {
    if (nodes.length > PAGE_GRAPH_LIMITS.children) errors.push({ code: 'page_graph.limit.children', path, message: `maximo ${PAGE_GRAPH_LIMITS.children} hijos` })
    nodes.forEach((n, i) => {
      const p = `${path}[${i}]`
      if (!isObj(n)) return void errors.push({ code: 'page_graph.shape', path: p, message: 'un nodo debe ser un objeto' })
      const id = typeof n.id === 'string' ? n.id : undefined
      if (++count > PAGE_GRAPH_LIMITS.nodes) {
        if (count === PAGE_GRAPH_LIMITS.nodes + 1) errors.push({ code: 'page_graph.limit.nodes', path: p, message: `maximo ${PAGE_GRAPH_LIMITS.nodes} nodos` })
        return
      }
      if (depth > PAGE_GRAPH_LIMITS.depth) return void errors.push({ code: 'page_graph.limit.depth', path: p, id, message: `profundidad maxima ${PAGE_GRAPH_LIMITS.depth}` })
      if (!id || !ID.test(id)) errors.push({ code: 'page_graph.id_invalid', path: `${p}.id`, id, message: 'id invalido (letra inicial; letras, digitos, _ . : -; max 96)' })
      else if (seen.has(id)) errors.push({ code: 'page_graph.id_duplicate', path: `${p}.id`, id, message: `id duplicado: ${id}` })
      else seen.add(id)
      const type = typeof n.type === 'string' ? n.type : ''
      if (!TYPE.test(type)) errors.push({ code: 'page_graph.type_invalid', path: `${p}.type`, id, message: 'tipo de bloque invalido' })
      if (n.props !== undefined) {
        if (!isObj(n.props)) errors.push({ code: 'page_graph.shape', path: `${p}.props`, id, message: 'props debe ser un objeto' })
        else for (const k of Object.keys(n.props)) if (RESERVED.has(k)) errors.push({ code: 'page_graph.props_reserved', path: `${p}.props.${k}`, id, message: `props.${k} es estructural: use el campo del nodo` })
      }
      if (n.area !== undefined && (typeof n.area !== 'string' || !/^[a-z][a-z0-9_]*$/.test(n.area))) errors.push({ code: 'page_graph.shape', path: `${p}.area`, id, message: 'area invalida' })
      checkVisibility(n.visible, `${p}.visible`, id, errors)
      // `tab` solo cuelga de `tabs`, y `tabs` solo admite `tab`.
      if (type === 'tab' && parentType !== 'tabs') errors.push({ code: 'page_graph.tab_parent', path: p, id, message: 'un nodo tab solo puede ser hijo de tabs' })
      if (Array.isArray(n.children)) {
        n.children.forEach((c, j) => isObj(c) && type === 'tabs' && c.type !== 'tab' && errors.push({ code: 'page_graph.tab_parent', path: `${p}.children[${j}]`, id: typeof c.id === 'string' ? c.id : undefined, message: 'tabs solo admite hijos tab' }))
        walk(n.children, `${p}.children`, depth + 1, type)
      } else if (n.children !== undefined) errors.push({ code: 'page_graph.shape', path: `${p}.children`, id, message: 'children debe ser una lista' })
      if (n.fallback_node !== undefined) {
        if (!isObj(n.fallback_node)) errors.push({ code: 'page_graph.shape', path: `${p}.fallback_node`, id, message: 'fallback_node debe ser un nodo' })
        else walk([n.fallback_node], `${p}.fallback_node#`, depth + 1, undefined)
      }
    })
  }
  walk(input.root, 'root', 1, undefined)
  return errors.length ? { ok: false, errors } : { ok: true, graph: input as unknown as PageGraph }
}

/** Ubicacion de un nodo: lo que un overlay necesita para direccionarlo. */
export interface GraphLocation {
  node: GraphNode
  /** `undefined` = raiz de la pagina. */
  parentId?: string
  index: number
  depth: number
  /** `child` = lista `children`; `fallback` = `fallback_node` del `parentId`. */
  via: 'root' | 'child' | 'fallback'
}

/** Indice id -> ubicacion (en orden de documento). Los ids repetidos se quedan con la primera aparicion. */
export function indexGraph(graph: Pick<PageGraph, 'root'>): Map<string, GraphLocation> {
  const out = new Map<string, GraphLocation>()
  const walk = (nodes: GraphNode[], parentId: string | undefined, depth: number, via: GraphLocation['via']) => {
    nodes.forEach((node, index) => {
      if (!out.has(node.id)) out.set(node.id, { node, parentId, index, depth, via: parentId === undefined ? 'root' : via })
      if (node.children) walk(node.children, node.id, depth + 1, 'child')
      if (node.fallback_node) walk([node.fallback_node], node.id, depth + 1, 'fallback')
    })
  }
  walk(graph.root, undefined, 1, 'root')
  return out
}

/** Ids en orden de documento (para listar/explicar). */
export function graphIds(graph: Pick<PageGraph, 'root'>): string[] {
  return [...indexGraph(graph).keys()]
}

export type HiddenReason = 'permission' | 'setting'

export interface HiddenNode {
  id: string
  reason: HiddenReason
  /** Permiso o clave de ajuste que decidio. */
  detail: string
}

export interface ResolveEnv {
  /** Permisos efectivos. Sin `can`, todo permiso declarado se niega (igual que `PageProvider`). */
  can?: (permission: string) => boolean
  /** Ajustes de la organizacion/preset por clave plana (`pos.show_vehicle`). */
  settings?: Record<string, unknown>
}

export interface ResolvedGraph {
  blocks: PageBlockDef[]
  /** `fallback_node` ya compilado, por id del nodo que lo declara. */
  fallbacks: Record<string, PageBlockDef>
  /** Nodos podados y por que (estatico: permiso o ajuste). Alimenta "Explain". */
  hidden: HiddenNode[]
}

function staticVisibility(v: GraphVisibility | undefined, env: ResolveEnv): HiddenNode | undefined {
  if (!v) return undefined
  if (v.permission && !(env.can?.(v.permission) ?? false)) return { id: '', reason: 'permission', detail: v.permission }
  if (v.setting) {
    const s = env.settings && Object.hasOwn(env.settings, v.setting.key) ? env.settings[v.setting.key] : undefined
    if (!evalPredicate(v.setting, s)) return { id: '', reason: 'setting', detail: v.setting.key }
  }
  return undefined
}

/**
 * Compila el grafo a bloques de pagina. Poda lo que el permiso o el ajuste ocultan
 * (y lo reporta en `hidden`); el predicado `when` queda en el bloque y se evalua vivo.
 * `children` pasa a `blocks` (o a `tabs[].blocks` en `tabs`); `props` se aplana.
 */
export function resolveGraph(graph: Pick<PageGraph, 'root'>, env: ResolveEnv = {}): ResolvedGraph {
  const hidden: HiddenNode[] = []
  const fallbacks: Record<string, PageBlockDef> = {}

  const compile = (n: GraphNode): PageBlockDef | null => {
    const h = staticVisibility(n.visible, env)
    if (h) return void hidden.push({ ...h, id: n.id }), null
    const block: PageBlockDef = { ...(n.props ?? {}), type: n.type, id: n.id }
    if (n.area) block.area = n.area
    if (n.fallback !== undefined) block.fallback = n.fallback
    if (n.visible?.when) block.when = n.visible.when
    if (n.children) {
      const kids = n.children.map(compile).filter((b): b is PageBlockDef => b !== null)
      if (n.type === 'tabs') {
        block.tabs = kids.map((k) => {
          const { type: _t, id, blocks, when: _w, area: _a, ...rest } = k
          void _t; void _w; void _a
          return { ...rest, key: typeof rest.key === 'string' ? rest.key : id, ...(blocks ? { blocks } : {}) }
        })
      } else block.blocks = kids
    }
    if (n.fallback_node) {
      const fb = compile(n.fallback_node)
      if (fb) fallbacks[n.id] = fb
    }
    return block
  }
  const blocks = graph.root.map(compile).filter((b): b is PageBlockDef => b !== null)
  return { blocks, fallbacks, hidden }
}

/**
 * Adopta una pagina existente (`ui.blocks`) como grafo. Respeta los `id` que ya trae; a los
 * demas les da `<padre>.<tipo>-<indice>` (determinista, pero depende del orden: por eso se
 * devuelven en `generated`; quien quiera overlays estables debe fijarlos a mano).
 */
export function pageToGraph(
  ui: { state?: Record<string, unknown>; data?: Record<string, unknown>; blocks: PageBlockDef[] },
  opts: { id: string; title?: unknown },
): { graph: PageGraph; generated: string[] } {
  const generated: string[] = []
  const conv = (b: PageBlockDef, parent: string | undefined, i: number): GraphNode => {
    const { type, id: bid, area, when, fallback, blocks, tabs, ...props } = b as Record<string, unknown> & PageBlockDef
    let id = typeof bid === 'string' ? bid : undefined
    if (!id) generated.push((id = `${parent ? `${parent}.` : ''}${String(type)}-${i}`))
    const node: GraphNode = { id, type: String(type) }
    if (Object.keys(props).length) node.props = props
    if (typeof area === 'string') node.area = area
    if (typeof fallback === 'string') node.fallback = fallback
    if (when && typeof when === 'object') node.visible = { when: when as GraphPredicate }
    if (Array.isArray(tabs)) {
      node.children = tabs.map((t: Record<string, unknown>, j: number) => {
        const { key, blocks: tb, ...rest } = t
        const tid = `${id}.tab-${String(key ?? j)}`
        generated.push(tid)
        const tn: GraphNode = { id: tid, type: 'tab', props: { key, ...rest } }
        if (Array.isArray(tb)) tn.children = (tb as PageBlockDef[]).map((c, k) => conv(c, tid, k))
        return tn
      })
    } else if (Array.isArray(blocks)) node.children = (blocks as PageBlockDef[]).map((c, k) => conv(c, id, k))
    return node
  }
  const graph: PageGraph = {
    version: PAGE_GRAPH_VERSION,
    id: opts.id,
    ...(opts.title !== undefined ? { title: opts.title } : {}),
    ...(ui.state ? { state: ui.state } : {}),
    ...(ui.data ? { data: ui.data } : {}),
    root: ui.blocks.map((b, i) => conv(b, undefined, i)),
  }
  return { graph, generated }
}

// ---- puente con el grafo plano de overlays (Loom, `applyOverlays` de runtime-react) ----
//
// La fusion de overlays trabaja sobre una lista PLANA de bloques `{ id, type, region, config, fallback }`.
// Este grafo es un arbol. El puente es sin perdida para todo lo que un overlay puede tocar:
// `region` = id del padre (sin region = raiz); el orden de la lista es el orden del documento
// (padre antes que sus hijos; hermanos en orden); `config` = `props` + `area` + `visible` + `fallback`
// (texto); `fallback` plano = `fallback_node` (solo hoja: sus hijos no viajan y se reportan en `lost`).
// Tipos estructurales: este paquete no depende de runtime-react.

export interface FlatBlock {
  id: string
  type: string
  region?: string
  config?: Record<string, unknown>
  fallback?: FlatBlock
}

export interface FlatGraph {
  id: string
  version: string
  blocks: FlatBlock[]
}


function toFlat(n: GraphNode, region: string | undefined, lost: string[]): FlatBlock {
  const config: Record<string, unknown> = { ...(n.props ?? {}) }
  if (n.area !== undefined) config.area = n.area
  if (n.visible !== undefined) config.visible = n.visible
  if (n.fallback !== undefined) config.fallback = n.fallback
  const flat: FlatBlock = { id: n.id, type: n.type }
  if (region !== undefined) flat.region = region
  if (Object.keys(config).length) flat.config = config
  if (n.fallback_node) {
    if (n.fallback_node.children?.length) lost.push(`${n.fallback_node.id}: los hijos de un fallback_node no viajan al grafo plano`)
    flat.fallback = toFlat({ ...n.fallback_node, children: undefined, fallback_node: undefined }, region, lost)
  }
  return flat
}

/** Arbol -> lista plana para `applyOverlays`. `version` es la de la base (la que declaran los `targets`). */
export function toBlockGraph(graph: Pick<PageGraph, 'id' | 'root'>, version: string): { graph: FlatGraph; lost: string[] } {
  const blocks: FlatBlock[] = []
  const lost: string[] = []
  const walk = (nodes: GraphNode[], region: string | undefined) => {
    for (const n of nodes) {
      blocks.push(toFlat(n, region, lost))
      if (n.children) walk(n.children, n.id)
    }
  }
  walk(graph.root, undefined)
  return { graph: { id: graph.id, version, blocks }, lost }
}

function fromFlat(b: FlatBlock): GraphNode {
  const { area, visible, fallback, ...props } = (b.config ?? {}) as Record<string, unknown>
  const node: GraphNode = { id: b.id, type: b.type }
  if (Object.keys(props).length) node.props = props
  if (typeof area === 'string') node.area = area
  if (visible && typeof visible === 'object') node.visible = visible as GraphVisibility
  if (typeof fallback === 'string') node.fallback = fallback
  if (b.fallback) node.fallback_node = fromFlat(b.fallback)
  return node
}

export interface FromFlatResult {
  graph: PageGraph
  /** Bloques cuyo padre ya no existe (p. ej. un overlay quito el contenedor): se descartan con sus hijos. */
  orphans: string[]
}

/**
 * Lista plana (resultado de `applyOverlays`) -> arbol. `meta` trae lo que el plano no lleva (`state`, `data`, `title`);
 * `provenance` (la del overlay) rellena `origin`. Revalidar con `parsePageGraph` antes de pintar.
 */
export function fromBlockGraph(
  flat: FlatGraph,
  meta: { state?: PageGraph['state']; data?: PageGraph['data']; title?: unknown } = {},
  provenance?: Record<string, { origin: string }>,
): FromFlatResult {
  const nodes = new Map<string, GraphNode>()
  const order: FlatBlock[] = []
  for (const b of flat.blocks) {
    // `replace` no copia la region del original: el bloque que lo sustituye se queda donde estaba.
    const region = b.region ?? b.fallback?.region
    const node = fromFlat(b)
    if (provenance?.[b.id]) node.origin = provenance[b.id]!.origin
    nodes.set(b.id, node)
    order.push({ ...b, region })
  }
  const root: GraphNode[] = []
  const orphans: string[] = []
  for (const b of order) {
    const node = nodes.get(b.id)!
    if (b.region === undefined) root.push(node)
    else {
      const parent = nodes.get(b.region)
      if (parent) (parent.children ??= []).push(node)
      else orphans.push(b.id)
    }
  }
  const graph: PageGraph = { version: PAGE_GRAPH_VERSION, id: flat.id, ...(meta.title !== undefined ? { title: meta.title } : {}), ...(meta.state ? { state: meta.state } : {}), ...(meta.data ? { data: meta.data } : {}), root }
  return { graph, orphans }
}
