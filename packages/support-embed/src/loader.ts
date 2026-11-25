/**
 * Loader del widget: sin React ni dependencias. Crea el iframe del Hub y un boton lanzador a partir
 * del id publico del canal. Toda la comunicacion es `postMessage` con `targetOrigin` = origen del
 * Hub; solo se atienden mensajes de la ventana del iframe y de ese origen.
 *
 * Los estilos se aplican por CSSOM (`el.style.x = …`), que respeta CSP `style-src` estricta del
 * sitio anfitrion; no hay `innerHTML`, `eval` ni atributos `style` en texto.
 */
import { envelope, parseToParent, type LauncherPosition, type ToFrame } from './protocol'

export const CHANNEL_ID = /^sch_[A-Za-z0-9]{8,64}$/

export interface LoaderOptions {
  doc: Document
  win: Window
  /** El `<script>` del loader: de el salen `src` (origen y ruta del frame), `data-channel` y `data-locale`. */
  script: Pick<HTMLScriptElement, 'src' | 'dataset'>
}

export type LoaderCommand = 'identify' | 'open' | 'close' | 'logout' | 'on'

export interface LoaderApi {
  (command: LoaderCommand, ...args: unknown[]): void
  q?: ArrayLike<unknown>[]
}

export interface LoaderHandle {
  api: LoaderApi
  /** Quita iframe, boton y escuchas. */
  destroy(): void
}

/** `https`, o `http` solo para `localhost` (desarrollo). */
function hubUrl(src: string): URL | null {
  try {
    const u = new URL(src)
    if (u.protocol === 'https:' || (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'))) return u
  } catch {
    // src invalido
  }
  return null
}

export function initLoader({ doc, win, script }: LoaderOptions): LoaderHandle | null {
  const channel = script.dataset.channel ?? ''
  const base = hubUrl(script.src)
  if (!CHANNEL_ID.test(channel) || !base) return null
  const hubOrigin = base.origin
  // El frame vive junto al loader: `…/v1/loader.js` -> `…/v1/frame`.
  const frameUrl = new URL('frame', base)
  frameUrl.searchParams.set('channel', channel)
  const locale = script.dataset.locale || win.navigator.language || ''
  if (locale) frameUrl.searchParams.set('locale', locale.slice(0, 35))

  let ready = false
  let open = false
  let unavailable = false
  let pendingIdentity: string | undefined
  let helloTries = 0
  let helloTimer: ReturnType<typeof setTimeout> | undefined
  const listeners = new Map<string, Set<(v: unknown) => void>>()

  const frame = doc.createElement('iframe')
  frame.src = frameUrl.toString()
  frame.title = 'Support'
  frame.setAttribute('referrerpolicy', 'no-referrer')
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox')
  frame.setAttribute('aria-hidden', 'true')
  Object.assign(frame.style, {
    position: 'fixed',
    bottom: '80px',
    right: '16px',
    width: 'min(380px, calc(100vw - 32px))',
    height: 'min(600px, calc(100vh - 96px))',
    border: '0',
    borderRadius: '12px',
    boxShadow: '0 8px 30px rgba(0,0,0,.25)',
    zIndex: '2147483000',
    display: 'none',
    colorScheme: 'normal',
  })

  const button = doc.createElement('button')
  button.type = 'button'
  button.setAttribute('aria-expanded', 'false')
  button.setAttribute('aria-label', 'Support')
  Object.assign(button.style, {
    position: 'fixed',
    bottom: '16px',
    right: '16px',
    display: 'none', // se muestra al recibir el perfil validado
    zIndex: '2147483000',
    border: '0',
    borderRadius: '9999px',
    padding: '12px 18px',
    font: '600 14px system-ui, sans-serif',
    cursor: 'pointer',
    background: '#0f172a',
    color: '#ffffff',
    boxShadow: '0 4px 14px rgba(0,0,0,.25)',
  })

  const emit = (name: string, v: unknown) => listeners.get(name)?.forEach((fn) => fn(v))
  const post = (msg: ToFrame) => frame.contentWindow?.postMessage(envelope(msg), hubOrigin)

  const place = (pos: LauncherPosition) => {
    const left = pos === 'bottom-left'
    button.style.left = left ? '16px' : 'auto'
    button.style.right = left ? 'auto' : '16px'
    frame.style.left = left ? '16px' : 'auto'
    frame.style.right = left ? 'auto' : '16px'
  }

  const setOpen = (next: boolean) => {
    if (unavailable || open === next) return
    open = next
    frame.style.display = next ? 'block' : 'none'
    frame.setAttribute('aria-hidden', String(!next))
    button.setAttribute('aria-expanded', String(next))
    post({ t: next ? 'open' : 'close' })
  }

  const hello = () => {
    post({ t: 'hello', locale })
    if (ready || helloTries++ >= 8) return
    helloTimer = setTimeout(hello, 250)
  }

  const onMessage = (e: MessageEvent) => {
    // Origen y ventana exactos: cualquier otra cosa se ignora en silencio.
    if (e.origin !== hubOrigin || e.source !== frame.contentWindow) return
    const msg = parseToParent(e.data)
    if (!msg) return
    switch (msg.t) {
      case 'ready':
        ready = true
        if (helloTimer) clearTimeout(helloTimer)
        if (pendingIdentity) post({ t: 'identify', token: pendingIdentity })
        break
      case 'profile':
        place(msg.position)
        button.textContent = msg.launcher
        button.style.background = msg.brand_color
        button.style.color = msg.on_brand
        button.style.display = unavailable ? 'none' : 'inline-flex'
        break
      case 'unread':
        emit('unread', msg.count)
        break
      case 'close':
        setOpen(false)
        break
      case 'unavailable':
        destroy()
        break
    }
  }

  button.addEventListener('click', () => setOpen(!open))
  frame.addEventListener('load', hello)
  win.addEventListener('message', onMessage)
  doc.body.append(frame, button)

  function destroy() {
    unavailable = true
    if (helloTimer) clearTimeout(helloTimer)
    win.removeEventListener('message', onMessage)
    frame.remove()
    button.remove()
  }

  const api: LoaderApi = (command, ...args) => {
    switch (command) {
      case 'identify': {
        const token = (args[0] as { token?: unknown } | undefined)?.token
        if (typeof token !== 'string' || !token) return
        pendingIdentity = token
        if (ready) post({ t: 'identify', token })
        break
      }
      case 'open':
        setOpen(true)
        break
      case 'close':
        setOpen(false)
        break
      case 'logout':
        pendingIdentity = undefined
        post({ t: 'logout' })
        break
      case 'on': {
        const [name, fn] = args
        if (typeof name === 'string' && typeof fn === 'function') {
          const set = listeners.get(name) ?? new Set()
          set.add(fn as (v: unknown) => void)
          listeners.set(name, set)
        }
        break
      }
    }
  }

  return { api, destroy }
}

/** Instala `window.MetacoreSupport` y reproduce la cola que el snippet dejo en `.q` (§4.2 del diseno). */
export function installLoader(opts: LoaderOptions): LoaderHandle | null {
  const handle = initLoader(opts)
  if (!handle) return null
  const w = opts.win as Window & { MetacoreSupport?: LoaderApi }
  const queued = w.MetacoreSupport?.q ?? []
  const api: LoaderApi = (command, ...args) => handle.api(command, ...args)
  w.MetacoreSupport = api
  for (const call of queued) {
    // `arguments` del snippet: [comando, ...args].
    const [command, ...args] = Array.from(call)
    handle.api(command as LoaderCommand, ...args)
  }
  return handle
}
