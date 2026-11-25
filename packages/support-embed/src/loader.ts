/**
 * Loader del widget: sin React ni dependencias. Crea el iframe del Hub a partir del id publico del
 * canal y lo presenta en uno de tres modos (los mismos del widget de `link`):
 *
 *  - `floating`: lanzador en la esquina y panel flotante (defecto).
 *  - `inline`: el iframe se monta DENTRO de un elemento de la pagina (`inline_target` / `data-target`);
 *    si aun no existe espera con un `MutationObserver` acotado en el tiempo y, si no aparece, se
 *    retira en silencio sin romper la pagina.
 *  - `push`: riel lateral a pantalla completa; al abrirse empuja el contenido de la pagina.
 *
 * Los valores de presentacion salen del perfil publico validado (mensaje `profile` del frame) y se
 * pueden sobrescribir con `data-*` del script o con `MetacoreSupport('init', …)`: manda el cliente.
 * Toda la comunicacion es `postMessage` con `targetOrigin` = origen del Hub; solo se atienden
 * mensajes de la ventana del iframe y de ese origen. El token de identidad vive solo en la
 * clausura y viaja por `postMessage`: nunca en el DOM, en la URL del frame ni en un atributo.
 *
 * Los estilos se aplican por CSSOM (`el.style.x = …`), que respeta una CSP `style-src` estricta del
 * sitio anfitrion; no hay `innerHTML`, `eval` ni atributos `style` en texto. El selector del modo
 * `inline` solo se usa con `document.querySelector` dentro de `try/catch`.
 */
import { createPagePusher, DISPLAY_LIMITS, mergeSettings, normalizeSettings, settingsFromProfile, type DisplayMode, type DisplaySettings } from './display'
import {
  floatingLauncherStyle,
  floatingPanelStyle,
  inlinePanelStyle,
  pushLauncherStyle,
  pushPanelStyle,
  railChevron,
  railChevronStyle,
  railLabelStyle,
  type Styles,
} from './layout-styles'
import { envelope, parseToParent, type ToFrame, type ToParent } from './protocol'

export const CHANNEL_ID = /^sch_[A-Za-z0-9]{8,64}$/
const LOCALE_TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/

/** Espera maxima del elemento destino del modo `inline`. */
export const TARGET_WAIT_MS = 10_000

export interface LoaderOptions {
  doc: Document
  win: Window
  /** El `<script>` del loader: de el salen `src` (origen y ruta del frame) y los `data-*` de configuracion. */
  script: Pick<HTMLScriptElement, 'src' | 'dataset'>
  /** Configuracion previa (la de las llamadas `init` encoladas por el snippet); pisa a los `data-*`. */
  init?: InitOptions
  /** Espera del objetivo inline en ms (defecto `TARGET_WAIT_MS`). */
  targetWaitMs?: number
}

/** Opciones de `init`/`mount`; todas opcionales y validadas antes de usarse. */
export interface InitOptions {
  channel?: string
  locale?: string
  mode?: DisplayMode
  /** Selector CSS del contenedor del modo `inline`. */
  target?: string
  height?: number
  width?: number
  offset?: number
  position?: 'bottom-right' | 'bottom-left'
  launcherShape?: 'round' | 'rounded' | 'square'
  launcherLabel?: string
}

export type LoaderCommand =
  | 'init'
  | 'mount'
  | 'unmount'
  | 'identify'
  | 'open'
  | 'close'
  | 'toggle'
  | 'logout'
  | 'reset'
  | 'setLanguage'
  | 'on'

export interface LoaderApi {
  (command: LoaderCommand, ...args: unknown[]): void
  q?: ArrayLike<unknown>[]
}

export interface LoaderHandle {
  api: LoaderApi
  /** Quita iframe, boton y escuchas, y deja el loader inerte. */
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

interface Config {
  channel: string
  locale: string
  autostart: boolean
  overrides: DisplaySettings
}

const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

const asLocale = (v: unknown): string => (typeof v === 'string' && v.length <= 35 && LOCALE_TAG.test(v) ? v : '')

/** Lee una capa de configuracion de un objeto sin tipo (`dataset` del script u opciones de `init`). */
function readLayer(raw: Record<string, unknown>): { channel?: string; locale?: string; settings: DisplaySettings } {
  return {
    channel: typeof raw.channel === 'string' ? raw.channel : undefined,
    locale: asLocale(raw.locale) || undefined,
    settings: normalizeSettings({
      mode: raw.mode,
      target: raw.target,
      height: raw.height,
      width: raw.width,
      offset: raw.offset,
      position: raw.position,
      shape: raw.launcherShape,
      label: raw.launcherLabel,
    }),
  }
}

const safeQuery = (doc: Document, selector: string): Element | null => {
  try {
    const el = doc.querySelector(selector)
    return el && el.nodeType === 1 ? el : null
  } catch {
    return null // selector invalido: se trata como "no existe"
  }
}

export function initLoader({ doc, win, script, init, targetWaitMs = TARGET_WAIT_MS }: LoaderOptions): LoaderHandle | null {
  const base = hubUrl(script.src)
  if (!base) return null
  const hubOrigin = base.origin

  const fromData = readLayer(asObject({ ...script.dataset }))
  const fromInit = readLayer(asObject(init))
  const cfg: Config = {
    channel: fromInit.channel ?? fromData.channel ?? '',
    locale: fromInit.locale ?? fromData.locale ?? (win.navigator.language || '').slice(0, 35),
    autostart: script.dataset.autostart !== 'false',
    overrides: mergeSettings(fromData.settings, fromInit.settings),
  }
  // Con autoarranque, un canal invalido no deja nada que hacer; en manual se valida en `mount`.
  if (cfg.autostart && !CHANNEL_ID.test(cfg.channel)) return null

  const listeners = new Map<string, Set<(v: unknown) => void>>()
  const pusher = createPagePusher(doc)
  let pendingIdentity: string | undefined
  let wantOpen = false
  let session: Session | null = null
  let dead = false

  const emit = (name: string, v: unknown) => listeners.get(name)?.forEach((fn) => fn(v))

  /** Todo lo que existe mientras el widget esta montado; `stop()` lo deshace por completo. */
  interface Session {
    stop(): void
    layout(): void
    setOpen(next: boolean): void
    isOpen(): boolean
    identify(token: string): void
    logout(): void
    reloadWith(locale: string): void
  }

  const frameSrc = (locale: string) => {
    // El frame vive junto al loader: `…/v1/loader.js` -> `…/v1/frame`.
    const u = new URL('frame', base)
    u.searchParams.set('channel', cfg.channel)
    if (locale) u.searchParams.set('locale', locale)
    return u.toString()
  }

  function start(): Session {
    let ready = false
    let open = false
    let helloTries = 0
    let pendingLogout = false
    let helloTimer: ReturnType<typeof setTimeout> | undefined
    let profile: Extract<ToParent, { t: 'profile' }> | null = null
    /** Donde esta el iframe: aparcado (flotante oculto hasta conocer el modo), en el cuerpo o dentro del destino. */
    let placed: 'parked' | 'body' | 'inline' = 'parked'
    let stopWaiting: (() => void) | undefined
    let locale = cfg.locale

    const frame = doc.createElement('iframe')
    frame.title = 'Support'
    frame.setAttribute('referrerpolicy', 'no-referrer')
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox')
    frame.setAttribute('aria-hidden', 'true')

    const button = doc.createElement('button')
    button.type = 'button'
    button.setAttribute('aria-expanded', 'false')
    button.setAttribute('aria-label', 'Support')

    const effective = (): DisplaySettings => mergeSettings(profile ? settingsFromProfile(profile) : undefined, cfg.overrides)
    /** `undefined` mientras el modo no se conoce (ni cliente ni perfil lo fijan). */
    const knownMode = (): DisplayMode | undefined => cfg.overrides.mode ?? profile?.display_mode ?? (profile ? 'floating' : undefined)

    const post = (msg: ToFrame) => frame.contentWindow?.postMessage(envelope(msg), hubOrigin)
    const effMode = () => placed === 'inline' ? 'inline' : (knownMode() ?? 'floating')

    const hello = () => {
      post({ t: 'hello', locale, mode: effMode() })
      if (ready || helloTries++ >= 8) return
      helloTimer = setTimeout(hello, 250)
    }

    const brand = () => (profile ? { color: profile.brand_color, on: profile.on_brand } : null)
    const paint = (panel: Styles) => {
      frame.style.cssText = ''
      Object.assign(frame.style, panel)
    }
    const paintButton = (st: Styles) => {
      button.style.cssText = ''
      Object.assign(button.style, st)
    }

    function layoutFloating(s: DisplaySettings) {
      paint(floatingPanelStyle(s, open))
      button.textContent = labelText(s)
      paintButton(floatingLauncherStyle(s, brand()))
      pusher.restore()
    }

    function layoutPush(s: DisplaySettings) {
      paint(pushPanelStyle(s, open))
      const text = labelText(s)
      const chevron = doc.createElement('span')
      chevron.textContent = railChevron(s, open)
      Object.assign(chevron.style, railChevronStyle)
      button.replaceChildren(chevron)
      if (text) {
        const label = doc.createElement('span')
        label.textContent = text
        Object.assign(label.style, railLabelStyle(s))
        button.append(label)
      }
      paintButton(pushLauncherStyle(s, open, brand(), win.innerWidth))
      if (open) pusher.push(s.position === 'bottom-left' ? 'left' : 'right', s.width ?? DISPLAY_LIMITS.width.def)
      else pusher.restore()
    }

    function layoutInline(s: DisplaySettings) {
      paint(inlinePanelStyle(s))
      frame.setAttribute('aria-hidden', 'false')
      pusher.restore()
    }

    const labelText = (s: DisplaySettings) => s.label ?? profile?.launcher ?? ''

    function layout() {
      const mode = knownMode()
      if (placed === 'inline') return layoutInline(effective())
      if (mode === 'inline') return // se coloca en `place()`; mientras tanto sigue aparcado
      if (mode === undefined) return layoutParked()
      if (mode === 'push') layoutPush(effective())
      else layoutFloating(effective())
      frame.setAttribute('aria-hidden', String(!open))
      button.setAttribute('aria-expanded', String(open))
    }
    function layoutParked() {
      layoutFloating(effective())
      frame.style.display = 'none'
      button.style.display = 'none'
    }

    function attachInline(target: Element) {
      placed = 'inline'
      button.remove()
      // Mover un iframe lo recarga: se rehace el saludo contra el documento nuevo.
      ready = false
      helloTries = 0
      if (helloTimer) clearTimeout(helloTimer)
      layoutInline(effective())
      target.append(frame)
      open = true
    }

    /** Coloca el iframe segun el modo efectivo (llamado al arrancar y al llegar el perfil). */
    function place() {
      const mode = knownMode()
      if (mode === undefined) return
      if (mode === 'inline') {
        if (placed === 'inline' || stopWaiting) return
        const selector = effective().target ?? DISPLAY_LIMITS.defaultTarget
        stopWaiting = waitForTarget(doc, win, selector, targetWaitMs, (el) => {
          stopWaiting = undefined
          attachInline(el)
        }, () => {
          stopWaiting = undefined
          stop() // sin destino: falla en silencio, la pagina sigue intacta
        })
        return
      }
      if (placed !== 'inline') {
        if (frame.parentNode !== doc.body) doc.body.append(frame)
        if (button.parentNode !== doc.body) doc.body.append(button)
        placed = 'body'
        layout()
      }
    }

    const setOpen = (next: boolean) => {
      if (placed === 'inline' || open === next) return
      open = next
      layout()
      post({ t: next ? 'open' : 'close' })
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
          if (pendingLogout) post({ t: 'logout' })
          pendingLogout = false
          if (pendingIdentity) post({ t: 'identify', token: pendingIdentity })
          if (open) post({ t: 'open' }) // un `open` anterior a `ready` pudo perderse
          break
        case 'profile':
          profile = msg
          place()
          layout()
          break
        case 'unread':
          emit('unread', msg.count)
          break
        case 'close':
          setOpen(false)
          break
        case 'unavailable':
          stop()
          break
      }
    }

    button.addEventListener('click', () => setOpen(!open))
    frame.addEventListener('load', hello)
    win.addEventListener('message', onMessage)

    function stop() {
      stopWaiting?.()
      stopWaiting = undefined
      if (helloTimer) clearTimeout(helloTimer)
      win.removeEventListener('message', onMessage)
      frame.remove()
      button.remove()
      pusher.restore()
      if (session === self) session = null
    }

    const self: Session = {
      stop,
      layout: () => {
        place()
        layout()
      },
      setOpen,
      isOpen: () => open,
      identify: (token) => {
        if (ready) post({ t: 'identify', token })
      },
      logout: () => {
        if (ready) post({ t: 'logout' })
        else pendingLogout = true
      },
      reloadWith(next) {
        locale = next
        ready = false
        helloTries = 0
        if (helloTimer) clearTimeout(helloTimer)
        if (frame.isConnected) frame.src = frameSrc(next)
      },
    }

    // Con el modo ya fijado por el cliente se coloca sin esperar al perfil; sin el, el iframe se
    // aparca oculto en el cuerpo (necesita cargar para entregar el perfil).
    frame.src = frameSrc(locale)
    if (cfg.overrides.mode === 'inline') {
      place()
    } else {
      doc.body.append(frame, button)
      layoutParked()
      if (cfg.overrides.mode) place()
    }
    if (wantOpen) setOpen(true)
    return self
  }

  const mount = () => {
    if (dead || session || !CHANNEL_ID.test(cfg.channel)) return
    session = start()
  }

  const api: LoaderApi = (command, ...args) => {
    if (dead) return
    switch (command) {
      case 'init':
      case 'mount': {
        const layer = readLayer(asObject(args[0]))
        if (!session && layer.channel !== undefined) cfg.channel = layer.channel
        if (layer.locale && !session) cfg.locale = layer.locale
        cfg.overrides = mergeSettings(cfg.overrides, layer.settings)
        if (command === 'mount') mount()
        else session?.layout() // `init` con el widget ya montado solo reajusta la presentacion
        break
      }
      case 'unmount':
        session?.stop()
        break
      case 'identify': {
        const token = (args[0] as { token?: unknown } | undefined)?.token
        if (typeof token !== 'string' || !token) return
        pendingIdentity = token
        session?.identify(token)
        break
      }
      case 'open':
        wantOpen = true
        session?.setOpen(true)
        break
      case 'close':
        wantOpen = false
        session?.setOpen(false)
        break
      case 'toggle':
        wantOpen = !(session ? session.isOpen() : wantOpen)
        session?.setOpen(wantOpen)
        break
      case 'logout':
      case 'reset':
        pendingIdentity = undefined
        session?.logout()
        break
      case 'setLanguage': {
        const next = asLocale(args[0])
        if (!next || next === cfg.locale) return
        cfg.locale = next
        session?.reloadWith(next)
        break
      }
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

  if (cfg.autostart) mount()

  return {
    api,
    destroy() {
      dead = true
      session?.stop()
    },
  }
}

/**
 * Espera a que `selector` resuelva a un elemento: lo busca ya y, si no esta, observa el DOM con un
 * `MutationObserver` hasta `waitMs`. Devuelve la funcion que cancela la espera.
 */
function waitForTarget(doc: Document, win: Window, selector: string, waitMs: number, found: (el: Element) => void, timedOut: () => void): () => void {
  const now = safeQuery(doc, selector)
  if (now) {
    found(now)
    return () => {}
  }
  let done = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const Observer = (win as Window & { MutationObserver?: typeof MutationObserver }).MutationObserver
  const observer = Observer
    ? new Observer(() => {
        const el = safeQuery(doc, selector)
        if (!el) return
        cancel()
        found(el)
      })
    : null
  function cancel() {
    done = true
    observer?.disconnect()
    if (timer) clearTimeout(timer)
  }
  observer?.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['id', 'class'] })
  timer = setTimeout(() => {
    if (done) return
    cancel()
    timedOut()
  }, waitMs)
  return cancel
}

/** Instala `window.MetacoreSupport` y reproduce la cola que el snippet dejo en `.q` (§4.2 del diseno). */
export function installLoader(opts: LoaderOptions): LoaderHandle | null {
  const w = opts.win as Window & { MetacoreSupport?: LoaderApi }
  const queued = Array.from(w.MetacoreSupport?.q ?? [])
  // Los `init` encolados configuran el arranque, antes de montar; el resto se reproduce en orden.
  const inits = queued.filter((c) => c[0] === 'init').map((c) => asObject(c[1]))
  const init = Object.assign({}, opts.init, ...inits) as InitOptions
  const handle = initLoader({ ...opts, init })
  if (!handle) return null
  const api: LoaderApi = (command, ...args) => handle.api(command, ...args)
  w.MetacoreSupport = api
  for (const call of queued) {
    // `arguments` del snippet: [comando, ...args].
    const [command, ...args] = Array.from(call)
    if (command !== 'init') handle.api(command as LoaderCommand, ...args)
  }
  return handle
}
