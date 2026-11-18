// PageContext (page@1): estado compartido de una pagina declarativa, bus de
// eventos minimo y `url_state` opcional. Sin eval: rutas de estado cerradas.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { GenUIRow } from '../registry'

export interface PageEvent {
  name: string
  /** Id del bloque/seccion que lo emitio. */
  source?: string
  payload?: unknown
}

export type PageEventHandler = (event: PageEvent) => void

export interface PageBus {
  emit(event: PageEvent): void
  /** `'*'` escucha todo. Devuelve la funcion que desuscribe. */
  on(name: string, handler: PageEventHandler): () => void
}

export function createPageBus(): PageBus {
  const handlers = new Map<string, Set<PageEventHandler>>()
  return {
    emit(event) {
      for (const key of [event.name, '*']) for (const h of [...(handlers.get(key) ?? [])]) h(event)
    },
    on(name, handler) {
      let set = handlers.get(name)
      if (!set) handlers.set(name, (set = new Set()))
      set.add(handler)
      return () => void set!.delete(handler)
    },
  }
}

export type SourceStatus = { status: 'loading' | 'ready' | 'error'; error?: string; retry?: () => void }

export interface PageContextValue {
  state: Record<string, unknown>
  /** `path` sin la raiz: `selected` o `filters.presence`. */
  setState(path: string, value: unknown): void
  emit(name: string, payload?: unknown, source?: string): void
  on: PageBus['on']
  /** Permisos efectivos del que mira. Sin `can` en el provider, todo permiso declarado se niega. */
  can(permission: string): boolean
  sourceStatus: Record<string, SourceStatus>
  ctx: Record<string, unknown>
}

const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype'])
const SEGMENT = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Valida una ruta de estado (`a.b.c`): segmentos simples, nunca llaves de prototipo. */
export function isSafePath(path: unknown): path is string {
  return typeof path === 'string' && path.length > 0 && path.split('.').every((s) => SEGMENT.test(s) && !FORBIDDEN.has(s))
}

export function getPath(root: unknown, path: string): unknown {
  let cur: unknown = root
  for (const seg of path.split('.')) {
    if (FORBIDDEN.has(seg) || cur === null || typeof cur !== 'object' || !Object.hasOwn(cur, seg)) return undefined
    cur = (cur as Record<string, unknown>)[seg]
  }
  return cur
}

export function setPath(root: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  if (!isSafePath(path)) return root
  const [head, ...rest] = path.split('.') as [string, ...string[]]
  if (rest.length === 0) return { ...root, [head]: value }
  const child = Object.hasOwn(root, head) && root[head] && typeof root[head] === 'object' ? (root[head] as Record<string, unknown>) : {}
  return { ...root, [head]: setPath(child, rest.join('.'), value) }
}

/** Resuelve `state.x.y`, `data.fuente.campo` (primera fila) y `ctx.x`. Cualquier otra raiz: undefined. */
export function resolveRef(ref: unknown, v: { state: Record<string, unknown>; sources?: Record<string, GenUIRow[] | undefined>; ctx?: Record<string, unknown> }): unknown {
  if (typeof ref !== 'string') return undefined
  const dot = ref.indexOf('.')
  if (dot < 0) return undefined
  const root = ref.slice(0, dot)
  const rest = ref.slice(dot + 1)
  if (root === 'state') return getPath(v.state, rest)
  if (root === 'ctx') return getPath(v.ctx ?? {}, rest)
  if (root === 'data') {
    const [name, ...field] = rest.split('.') as [string, ...string[]]
    if (FORBIDDEN.has(name) || !v.sources || !Object.hasOwn(v.sources, name)) return undefined
    const row = v.sources[name]?.[0]
    return field.length ? getPath(row, field.join('.')) : row
  }
  return undefined
}

/** Predicado de `when` (ref + equals/in/not_in/empty) ya con el valor resuelto. */
export function evalPredicate(p: { equals?: unknown; in?: unknown[]; not_in?: unknown[]; empty?: boolean }, value: unknown): boolean {
  const isEmpty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
  if (p.empty !== undefined && p.empty !== isEmpty) return false
  if (Object.hasOwn(p, 'equals') && p.equals !== value) return false
  if (p.in && !p.in.includes(value)) return false
  if (p.not_in && p.not_in.includes(value)) return false
  return true
}

const Ctx = createContext<PageContextValue | null>(null)

/** Adaptador de `url_state`: por defecto `?s.<clave>=<json>` con `history.replaceState`. */
export interface UrlStateAdapter {
  read(): URLSearchParams
  write(params: URLSearchParams): void
}

const browserUrl: UrlStateAdapter = {
  read: () => new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search),
  write: (params) => {
    if (typeof window === 'undefined') return
    const qs = params.toString()
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`)
  },
}

const URL_PREFIX = 's.'

export interface PageProviderProps {
  initialState?: Record<string, unknown>
  /** Claves RAIZ de `state` reflejadas en la URL (deep link). */
  urlState?: string[]
  urlAdapter?: UrlStateAdapter
  can?: (permission: string) => boolean
  sourceStatus?: Record<string, SourceStatus>
  /** Valores de solo lectura para `ctx.*` (locale, branch_id...). */
  ctx?: Record<string, unknown>
  /** Bus compartido (p. ej. para que el host escuche); si no, uno por pagina. */
  bus?: PageBus
  children?: ReactNode
}

export function PageProvider({ initialState, urlState, urlAdapter = browserUrl, can, sourceStatus, ctx, bus: given, children }: PageProviderProps) {
  const bus = useMemo(() => given ?? createPageBus(), [given])
  const keys = useMemo(() => (urlState ?? []).filter((k) => isSafePath(k) && !k.includes('.')), [urlState])
  const [state, setStateRaw] = useState<Record<string, unknown>>(() => {
    let s = { ...(initialState ?? {}) }
    if (keys.length) {
      const params = urlAdapter.read()
      for (const k of keys) {
        const raw = params.get(URL_PREFIX + k)
        if (raw === null) continue
        try {
          s = setPath(s, k, JSON.parse(raw))
        } catch {
          /* valor ilegible: se ignora */
        }
      }
    }
    return s
  })

  const setState = useCallback((path: string, value: unknown) => {
    if (!isSafePath(path)) return
    setStateRaw((prev) => setPath(prev, path, value))
  }, [])

  useEffect(() => {
    if (!keys.length) return
    const params = urlAdapter.read()
    for (const k of keys) {
      const v = state[k]
      if (v === undefined || v === null) params.delete(URL_PREFIX + k)
      else params.set(URL_PREFIX + k, JSON.stringify(v))
    }
    urlAdapter.write(params)
  }, [state, keys, urlAdapter])

  const value = useMemo<PageContextValue>(
    () => ({
      state,
      setState,
      emit: (name, payload, source) => bus.emit({ name, payload, source }),
      on: bus.on,
      can: can ?? (() => false),
      sourceStatus: sourceStatus ?? {},
      ctx: ctx ?? {},
    }),
    [state, setState, bus, can, sourceStatus, ctx],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

const NOOP: PageContextValue = {
  state: {},
  setState: () => {},
  emit: () => {},
  on: () => () => {},
  can: () => false,
  sourceStatus: {},
  ctx: {},
}

/** Contexto de la pagina; fuera de un `PageProvider` es inerte (estado vacio, sin permisos). */
export function usePageContext(): PageContextValue {
  return useContext(Ctx) ?? NOOP
}

/** `[valor, set]` de una ruta de estado. */
export function usePageState<T = unknown>(path: string): [T | undefined, (value: T) => void] {
  const { state, setState } = usePageContext()
  return [getPath(state, path) as T | undefined, useCallback((v: T) => setState(path, v), [setState, path])]
}

/** Suscribe un handler al bus mientras el componente vive. */
export function usePageEvent(name: string, handler: PageEventHandler): void {
  const { on } = usePageContext()
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => on(name, (e) => ref.current(e)), [on, name])
}
