/**
 * Puerto del frame hacia la pagina padre. El origen del padre se toma del primer mensaje valido
 * (`event.origin` lo garantiza el navegador) y solo si viene de `window.parent`; si el navegador
 * expone `location.ancestorOrigins` debe coincidir. Desde entonces solo se aceptan mensajes de ese
 * origen y se envia con `targetOrigin` = ese origen (nunca `*`).
 */
import { envelope, parseToFrame, type DisplayMode, type ToFrame, type ToParent } from './protocol'

export interface ParentPort {
  /** Se resuelve con el origen del padre tras el primer `hello` valido. */
  origin: Promise<string>
  /** Origen ya conocido, o `undefined`. */
  currentOrigin(): string | undefined
  /** Modo de presentacion que anuncio el ultimo `hello` del loader (el montaje de React llega despues del primero). */
  currentMode(): DisplayMode | undefined
  on(handler: (msg: ToFrame) => void): () => void
  /** No hace nada hasta conocer el origen del padre. */
  send(msg: ToParent): void
  dispose(): void
}

export function createParentPort(win: Window & { location: Location }): ParentPort {
  let origin: string | undefined
  let mode: DisplayMode | undefined
  const handlers = new Set<(m: ToFrame) => void>()
  let resolve!: (o: string) => void
  const originPromise = new Promise<string>((r) => (resolve = r))
  const ancestor = (win.location as Location & { ancestorOrigins?: ArrayLike<string> }).ancestorOrigins?.[0]

  const onMessage = (e: MessageEvent) => {
    if (e.source !== win.parent) return
    const msg = parseToFrame(e.data)
    if (!msg) return
    if (origin === undefined) {
      // Solo un `hello` fija el origen; el resto antes de eso se ignora.
      if (msg.t !== 'hello') return
      if (!e.origin || e.origin === 'null') return
      if (ancestor && ancestor !== e.origin) return
      origin = e.origin
      resolve(origin)
    } else if (e.origin !== origin) {
      return
    }
    if (msg.t === 'hello' && msg.mode) mode = msg.mode
    handlers.forEach((h) => h(msg))
  }
  win.addEventListener('message', onMessage)

  return {
    origin: originPromise,
    currentOrigin: () => origin,
    currentMode: () => mode,
    on: (h) => {
      handlers.add(h)
      return () => handlers.delete(h)
    },
    send: (msg) => {
      if (origin !== undefined) win.parent.postMessage(envelope(msg), origin)
    },
    dispose: () => win.removeEventListener('message', onMessage),
  }
}
