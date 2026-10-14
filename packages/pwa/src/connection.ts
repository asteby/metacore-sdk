/**
 * Estado de la conexión con el API: un solo aviso discreto en lugar de un toast
 * de error por cada petición fallida.
 *
 * Un «Network Error» suelto no es una caída: en móvil el sistema corta las
 * peticiones al bloquear la pantalla o cambiar de app, y un despliegue reinicia
 * el backend unos segundos. Por eso un fallo solo inicia una comprobación en
 * silencio (petición pública y barata, con reintentos espaciados) y el aviso
 * aparece si la conexión sigue caída tras la gracia. Al volver se anuncia una
 * vez y se avisa a la app (onConnectionRestored) para recargar sus datos.
 *
 * Uso típico:
 *
 *   attachConnectionReporter(api)               // axios del app
 *   onConnectionRestored(() => queryClient.invalidateQueries({ refetchType: 'active' }))
 *   <OfflineIndicator />                        // pinta el estado
 */
import { useSyncExternalStore } from 'react'

export type ConnectionState =
  /** Todo bien (no se muestra nada). */
  | 'online'
  /** Hubo un fallo; se está comprobando en silencio, aún sin aviso. */
  | 'checking'
  /** El servidor no responde desde hace más que la gracia. */
  | 'offline'
  /** El dispositivo no tiene red. */
  | 'no-internet'
  /** Se recuperó la conexión (se muestra un momento). */
  | 'restored'

export interface ConnectionProbeOptions {
  /** URL pública y barata para comprobar el servidor. Por defecto `/api/push/public-key`. */
  url?: string
  /** Tiempo sin conexión antes de avisar. Por defecto 6 s. */
  graceMs?: number
}

const RESUME_IGNORE_MS = 4_000
const RESTORED_MS = 3_000
const BACKOFF_MS = [1_500, 3_000, 5_000, 10_000, 20_000, 30_000]

let probeUrl = '/api/push/public-key'
let graceMs = 6_000
let state: ConnectionState = 'online'
let failingSince = 0
let attempt = 0
let probeTimer: ReturnType<typeof setTimeout> | null = null
let restoredTimer: ReturnType<typeof setTimeout> | null = null
let lastVisibleAt = typeof document === 'undefined' ? 0 : Date.now()
const listeners = new Set<() => void>()
const restoredListeners = new Set<() => void>()

function set(next: ConnectionState) {
  if (next === state) return
  state = next
  listeners.forEach((l) => l())
}

function online(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false
}

function clearProbe() {
  if (probeTimer) clearTimeout(probeTimer)
  probeTimer = null
}

/** Configura la comprobación (URL y gracia). */
export function configureConnectionProbe(opts: ConnectionProbeOptions) {
  if (opts.url) probeUrl = opts.url
  if (typeof opts.graceMs === 'number') graceMs = opts.graceMs
}

export function getConnectionState(): ConnectionState {
  return state
}

/** Suscribe a la recuperación de la conexión (solo si se llegó a avisar). */
export function onConnectionRestored(cb: () => void): () => void {
  restoredListeners.add(cb)
  return () => restoredListeners.delete(cb)
}

function recovered() {
  const wasShown = state === 'offline' || state === 'no-internet'
  failingSince = 0
  attempt = 0
  clearProbe()
  if (!wasShown) {
    set('online')
    return
  }
  set('restored')
  restoredListeners.forEach((cb) => cb())
  if (restoredTimer) clearTimeout(restoredTimer)
  restoredTimer = setTimeout(() => set('online'), RESTORED_MS)
}

async function probe() {
  probeTimer = null
  if (!online()) {
    set('no-internet')
    return // el evento «online» reanuda la comprobación
  }
  try {
    const res = await fetch(probeUrl, { cache: 'no-store', credentials: 'same-origin' })
    // Cualquier respuesta del servidor (incluso 4xx) es conexión; 502–504 del
    // proxy es el backend reiniciando.
    if (res.status < 502 || res.status > 504) {
      recovered()
      return
    }
  } catch {
    // sigue sin conexión
  }
  if (Date.now() - failingSince >= graceMs) set('offline')
  scheduleProbe()
}

function scheduleProbe() {
  if (probeTimer) return
  const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]
  attempt += 1
  probeTimer = setTimeout(() => void probe(), delay)
}

/**
 * Informa un error de red (petición sin respuesta). No muestra nada por sí
 * solo: arranca la comprobación en silencio.
 */
export function reportNetworkError() {
  if (typeof document !== 'undefined') {
    // Pestaña en segundo plano o recién recuperada: peticiones cortadas por el
    // sistema, no una caída.
    if (document.visibilityState === 'hidden') return
    if (Date.now() - lastVisibleAt < RESUME_IGNORE_MS) return
  }
  if (state === 'restored') set('online')
  if (!failingSince) {
    failingSince = Date.now()
    set('checking')
  }
  if (!online()) {
    set('no-internet')
    return
  }
  scheduleProbe()
}

/** Informa que una petición llegó al servidor: si había fallo, se recupera ya. */
export function reportReachable() {
  if (state === 'online' || state === 'restored') return
  recovered()
}

type InterceptorClient = {
  interceptors: {
    response: {
      use: (onFulfilled: (r: unknown) => unknown, onRejected: (e: unknown) => unknown) => number
    }
  }
}

function isNetworkError(err: unknown): boolean {
  const e = err as { response?: unknown; code?: string; message?: string } | null
  if (!e || e.response) return false
  return e.code === 'ERR_NETWORK' || e.message === 'Network Error'
}

/**
 * Conecta una instancia de axios (o compatible): los errores de red alimentan
 * el estado y cualquier respuesta lo recupera. Devuelve el id del interceptor.
 */
export function attachConnectionReporter(client: InterceptorClient): number {
  return client.interceptors.response.use(
    (res) => {
      reportReachable()
      return res
    },
    (err) => {
      if (isNetworkError(err)) reportNetworkError()
      else if ((err as { response?: unknown } | null)?.response) reportReachable()
      return Promise.reject(err)
    },
  )
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') lastVisibleAt = Date.now()
  })
  window.addEventListener('offline', () => {
    if (!failingSince) failingSince = Date.now()
    clearProbe()
    set('no-internet')
  })
  window.addEventListener('online', () => {
    if (state === 'online' || state === 'restored') return
    attempt = 0
    clearProbe()
    void probe()
  })
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Estado actual de la conexión (React). */
export function useConnectionState(): ConnectionState {
  return useSyncExternalStore(subscribe, () => state, () => 'online')
}

/** Solo para pruebas. */
export function __resetConnectionState() {
  state = 'online'
  failingSince = 0
  attempt = 0
  lastVisibleAt = 0
  graceMs = 6_000
  probeUrl = '/api/push/public-key'
  clearProbe()
  if (restoredTimer) clearTimeout(restoredTimer)
  restoredTimer = null
  restoredListeners.clear()
}
