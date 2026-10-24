import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { Money } from '@asteby/storefront'
import { openCartDrawer, setQuietOpen } from './store.js'

// Estado optimista del cajón del carrito. Solo guarda FILAS provisionales (producto, imagen, título, precio mostrado
// y cantidad) mientras OPS responde. Nunca calcula dinero: precios, totales, impuestos y envío los dicta OPS cuando
// llega el carrito real. Vive fuera de React, como el estado de apertura del cajón.

/** Lo que la tienda sabe del producto al pulsar «Agregar». `price` es el precio unitario ya mostrado en la ficha. */
export type OptimisticLineInput = {
  /** Variante agregada; dos acciones con la misma variante comparten una sola fila. */
  variantId: string
  title: string
  variantTitle?: string | null | undefined
  productHandle?: string | undefined
  image?: { url: string; alt?: string | null | undefined } | null | undefined
  /** Precio unitario mostrado (solo se pinta, no se multiplica ni se suma). */
  price?: Money | null | undefined
  /** Unidades de ESTA acción (por omisión 1). */
  quantity?: number | undefined
  /** Clave de idempotencia: repetir `add` con una clave viva devuelve la misma acción sin sumar otra vez. */
  key?: string | undefined
}

export type OptimisticAction = Required<Pick<OptimisticLineInput, 'variantId' | 'title'>> &
  Omit<OptimisticLineInput, 'quantity' | 'key'> & { id: string; quantity: number; key?: string | undefined }

/** Fila provisional: todas las acciones en vuelo de una misma variante. */
export type OptimisticRow = {
  variantId: string
  title: string
  variantTitle?: string | null | undefined
  productHandle?: string | undefined
  image?: { url: string; alt?: string | null | undefined } | null | undefined
  price?: Money | null | undefined
  /** Unidades agregadas que OPS aún no confirma. */
  quantity: number
  actionIds: string[]
}

export type OptimisticNotice = { id: string; title: string; reason: string }

export type OptimisticSnapshot = {
  rows: readonly OptimisticRow[]
  /** Unidades provisionales en total (para el contador). */
  quantity: number
  notices: readonly OptimisticNotice[]
  /** Último evento a anunciar en la región `aria-live="polite"`; `n` cambia en cada evento. */
  announcement: { kind: 'added' | null; n: number }
}

export type AddOutcome = { ok: true } | { ok: false; reason: string }

const DEFAULT_TIMEOUT_MS = 30_000

let actions: OptimisticAction[] = []
let notices: OptimisticNotice[] = []
let announcement: OptimisticSnapshot['announcement'] = { kind: null, n: 0 }
let seq = 0
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const listeners = new Set<() => void>()
let snapshot: OptimisticSnapshot = compute()

function compute(): OptimisticSnapshot {
  const byVariant = new Map<string, OptimisticRow>()
  for (const a of actions) {
    const row = byVariant.get(a.variantId)
    if (row) {
      row.quantity += a.quantity
      row.actionIds.push(a.id)
    } else {
      byVariant.set(a.variantId, {
        variantId: a.variantId, title: a.title, variantTitle: a.variantTitle, productHandle: a.productHandle,
        image: a.image, price: a.price, quantity: a.quantity, actionIds: [a.id],
      })
    }
  }
  const rows = [...byVariant.values()]
  return { rows, quantity: rows.reduce((n, r) => n + r.quantity, 0), notices, announcement }
}

function emit() {
  snapshot = compute()
  for (const l of [...listeners]) l()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
const EMPTY: OptimisticSnapshot = { rows: [], quantity: 0, notices: [], announcement: { kind: null, n: 0 } }

function drop(id: string): OptimisticAction | undefined {
  const a = actions.find((x) => x.id === id)
  if (!a) return undefined
  actions = actions.filter((x) => x.id !== id)
  const t = timers.get(id)
  if (t) clearTimeout(t)
  timers.delete(id)
  return a
}

function announce() {
  announcement = { kind: 'added', n: announcement.n + 1 }
}

export const cartOptimistic = {
  /**
   * Inserta YA la fila provisional, sube el contador y abre el cajón sin robar el foco. Devuelve el id de la acción
   * para `confirm` / `rollback`. Una acción por clic: la misma variante suma cantidad en una sola fila.
   */
  add(input: OptimisticLineInput, options: { open?: boolean; timeoutMs?: number } = {}): string {
    if (input.key) {
      const live = actions.find((a) => a.key === input.key)
      if (live) return live.id
    }
    const id = `opt-${++seq}`
    const quantity = Math.max(1, Math.floor(input.quantity ?? 1))
    actions = [...actions, { ...input, id, quantity }]
    const ms = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    if (ms > 0 && typeof setTimeout === 'function') {
      timers.set(id, setTimeout(() => cartOptimistic.rollback(id, describeAddFailure({ code: 'timeout' })), ms))
    }
    announce()
    if (options.open !== false) {
      setQuietOpen(true)
      openCartDrawer()
    }
    emit()
    return id
  },

  /** OPS confirmó: la fila provisional sale y el carrito real (ya en `cart`) ocupa su lugar. */
  confirm(id: string) {
    if (!drop(id)) return
    announce()
    emit()
  },

  /** Falló: se quita la acción (y su cantidad) y se avisa «No pudimos agregar X: motivo». */
  rollback(id: string, reason = 'unknown') {
    const a = drop(id)
    if (!a) return
    notices = [...notices, { id: `n-${++seq}`, title: a.title, reason }]
    emit()
  },

  /** Quita la acción sin avisar (el componente que la lanzó se desmontó). */
  discard(id: string) {
    if (drop(id)) emit()
  },

  dismissNotice(id: string) {
    notices = notices.filter((n) => n.id !== id)
    emit()
  },

  /** Limpia todo (pruebas, cierre de sesión). */
  reset() {
    for (const t of timers.values()) clearTimeout(t)
    timers.clear()
    actions = []
    notices = []
    announcement = { kind: null, n: 0 }
    setQuietOpen(false)
    emit()
  },

  getSnapshot: (): OptimisticSnapshot => snapshot,
}

/** Estado optimista (filas, contador, avisos). En el servidor siempre vacío. */
export function useOptimisticCart(): OptimisticSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY)
}

/** Contador para la cabecera: unidades del carrito de OPS más las que están en vuelo. */
export function useOptimisticCartCount(base: number): number {
  return base + useOptimisticCart().quantity
}

/** Motivo corto en es-MX a partir de un error de la acción (HTTP, código de OPS o red). */
export function describeAddFailure(error: { status?: number | undefined; code?: string | undefined; message?: string | undefined } | null | undefined): string {
  const code = error?.code
  const status = error?.status
  if (code === 'store_not_ready') return 'la tienda está cerrada por ahora'
  if (code === 'timeout') return 'tardó demasiado, intenta de nuevo'
  if (status === 409 || code === 'out_of_stock' || code === 'insufficient_stock') return 'sin existencias suficientes'
  if (status === 0 || code === 'network' || (!status && !code)) return 'revisa tu conexión'
  if (status && status >= 500) return 'hubo un problema, intenta de nuevo'
  if (status === 404) return 'el producto ya no está disponible'
  return error?.message?.trim() || 'intenta de nuevo'
}

type FetcherLike = { state: string; data?: unknown }

/** Interpreta `fetcher.data` de la acción de ruta: `{ error }`, `{ success:false }`, `{ ok:false }` o `status >= 400` fallan. */
export function defaultAddOutcome(data: unknown): AddOutcome {
  if (!data || typeof data !== 'object') return { ok: true }
  const d = data as Record<string, unknown>
  const status = typeof d.status === 'number' ? d.status : undefined
  const err = (d.error && typeof d.error === 'object' ? d.error : d) as Record<string, unknown>
  const code = typeof err.code === 'string' ? err.code : undefined
  const failed = d.error != null || d.ok === false || d.success === false || (status !== undefined && status >= 400)
  if (!failed) return { ok: true }
  return { ok: false, reason: describeAddFailure({ status: status ?? (typeof err.status === 'number' ? err.status : undefined), code, message: typeof err.message === 'string' ? err.message : undefined }) }
}

/**
 * Conecta un `useFetcher()` de React Router con el estado optimista. `add(input, submit)` inserta la fila, abre el
 * cajón y llama a `submit()` (el `fetcher.submit(...)` de la tienda); al terminar el fetcher confirma o revierte.
 * Un nuevo `add` con el mismo fetcher antes de terminar da por entregado el anterior (el router lo reemplaza y el
 * carrito real que llega con la revalidación manda). Si el componente se desmonta, las filas se descartan sin aviso.
 */
export function useOptimisticAdd(fetcher: FetcherLike, options: { settle?: (data: unknown) => AddOutcome } = {}) {
  const current = useRef<string | null>(null)
  const was = useRef(false)
  const settleRef = useRef(options.settle)
  settleRef.current = options.settle

  useEffect(() => {
    const busy = fetcher.state !== 'idle'
    const id = current.current
    if (was.current && !busy && id) {
      current.current = null
      const out = (settleRef.current ?? defaultAddOutcome)(fetcher.data)
      if (out.ok) cartOptimistic.confirm(id)
      else cartOptimistic.rollback(id, out.reason)
    }
    was.current = busy
  }, [fetcher.state, fetcher.data])

  useEffect(
    () => () => {
      if (current.current) cartOptimistic.discard(current.current)
      current.current = null
    },
    [],
  )

  return {
    add(input: OptimisticLineInput, submit: () => void): string {
      const prev = current.current
      const id = cartOptimistic.add(input)
      if (prev && prev !== id) cartOptimistic.confirm(prev)
      current.current = id
      try {
        submit()
      } catch (e) {
        current.current = null
        cartOptimistic.rollback(id, describeAddFailure({ message: e instanceof Error ? e.message : undefined }))
      }
      return id
    },
  }
}
