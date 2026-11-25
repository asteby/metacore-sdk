/**
 * Embed "en codigo": el mismo widget del loader, pero montado por el propio sitio dentro de su
 * pagina, sin iframe ni loader. Reutiliza lo que ya hace el frame (`SupportFrame` -> `SupportThread`
 * sobre `createEmbedTransport`, perfil validado y tema) y los mismos estilos de modo que el loader
 * (`layout-styles`); solo cambia el puerto: en vez de `postMessage` es un puerto en proceso.
 *
 * Diferencias de seguridad respecto al loader (y por que existe el iframe): aqui el JS de la pagina
 * comparte realm con el token de sesion, que vive solo en la clausura del transporte (no se escribe en
 * el DOM, ni se registra, ni se expone). Quien necesite aislar al widget del JS de terceros de su
 * pagina debe usar el loader. La identidad verificada sigue siendo SOLO el JWT firmado por la empresa.
 */
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import { createEmbedTransport, type VisitorTokenStore } from '@asteby/metacore-sdk/support'
import {
  createPagePusher,
  DISPLAY_LIMITS,
  mergeSettings,
  normalizeSettings,
  settingsFromProfile,
  type DisplayMode,
  type DisplaySettings,
  type LauncherPosition,
  type LauncherShape,
} from './display'
import { createFrameI18n } from './frame-i18n'
import { localVisitorStore } from './frame-boot'
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
import { resolveLocale } from './profile'
import { parseToFrame, type ToFrame, type ToParent } from './protocol'
import { SupportFrame, type FramePort } from './support-frame'

export interface SupportEmbedOptions {
  /** Id publico del canal (`sch_…`). */
  channel: string
  /** Ruta de `POST` de sesiones, relativa a `baseUrl` (la que sirve el Hub; nada esta fijado en el paquete). */
  sessionPath: string
  /** Prefijo de la API del widget del Hub. */
  apiBase: string
  /** Base absoluta del Hub; ausente = mismo origen. */
  baseUrl?: string
  /** Modo de presentacion. Ausente = el del perfil publico, o `floating`. El valor del cliente manda. */
  mode?: DisplayMode
  /** JWT de identidad firmado por TU servidor (HS256). Ausente o `null` = visitante anonimo. */
  identity?: string | null
  locale?: string
  /** `inline`: alto en px (200-2000, defecto 600). */
  height?: number
  /** `floating`/`push`: ancho del panel en px (280-720). */
  width?: number
  /** `floating`: separacion al borde en px (0-200, defecto 16). */
  offset?: number
  /** `floating`/`push`: esquina o borde. */
  position?: LauncherPosition
  launcherShape?: LauncherShape
  launcherLabel?: string
  /** Muestra el boton de reabrir casos (`embed_policy.reopen` del canal). */
  allowReopen?: boolean
  /** Estado abierto controlado (`floating`/`push`). Sin el, el componente lleva su propio estado. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onUnread?: (count: number) => void
  /** El Hub informo que el widget no puede funcionar en este sitio (origen no permitido, canal inactivo…). */
  onUnavailable?: () => void
  /** Almacen del token de visitante; defecto `localStorage` por canal (efimero si esta bloqueado). */
  visitorStore?: VisitorTokenStore
  className?: string
}

export type SupportEmbedProps = SupportEmbedOptions

const PANEL_BASE: Styles = { overflow: 'hidden', background: 'var(--background, #fff)', color: 'var(--foreground, inherit)' }

/** Puerto en proceso: lo que el frame envia al padre y lo que el padre le ordena, sin `postMessage`. */
function createLocalPort(onParent: (m: ToParent) => void) {
  const handlers = new Set<(m: ToFrame) => void>()
  const port: FramePort = {
    send: onParent,
    on: (h) => {
      handlers.add(h)
      return () => void handlers.delete(h)
    },
  }
  return { port, emit: (m: ToFrame) => handlers.forEach((h) => h(m)) }
}

const sameSite = (): string => (typeof window === 'undefined' ? '' : window.location.origin)

export function SupportEmbed(props: SupportEmbedProps) {
  const { channel, sessionPath, apiBase, baseUrl, identity, allowReopen, className, onUnread, onUnavailable, onOpenChange } = props
  const [rootEl, setRootEl] = React.useState<HTMLElement | null>(null)
  const [profile, setProfile] = React.useState<Extract<ToParent, { t: 'profile' }> | null>(null)
  const [gone, setGone] = React.useState(false)
  const [innerOpen, setInnerOpen] = React.useState(false)
  const controlled = props.open !== undefined
  const open = controlled ? !!props.open : innerOpen

  const callbacks = React.useRef({ onUnread, onUnavailable, onOpenChange })
  callbacks.current = { onUnread, onUnavailable, onOpenChange }
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!controlled) setInnerOpen(next)
      callbacks.current.onOpenChange?.(next)
    },
    [controlled],
  )
  const setOpenRef = React.useRef(setOpen)
  setOpenRef.current = setOpen

  const identityRef = React.useRef<string | undefined>(identity ?? undefined)
  const local = React.useMemo(
    () =>
      createLocalPort((m) => {
        if (m.t === 'profile') setProfile(m)
        else if (m.t === 'unread') callbacks.current.onUnread?.(m.count)
        else if (m.t === 'close') setOpenRef.current(false)
        else if (m.t === 'unavailable') {
          setGone(true)
          callbacks.current.onUnavailable?.()
        }
      }),
    [],
  )

  const { locale, ui } = React.useMemo(
    () => resolveLocale({ requested: props.locale, navigatorLanguage: typeof navigator === 'undefined' ? undefined : navigator.language }),
    [props.locale],
  )
  const i18n = React.useMemo(() => createFrameI18n(ui), [ui])
  const visitorStore = props.visitorStore
  const embed = React.useMemo(
    () =>
      createEmbedTransport({
        baseUrl,
        channel,
        parentOrigin: sameSite(),
        sessionPath,
        locale,
        identity: () => identityRef.current,
        visitorToken: visitorStore ?? localVisitorStore(window, channel),
      }),
    [baseUrl, channel, sessionPath, locale, visitorStore],
  )
  React.useEffect(() => () => embed.stop(), [embed])

  // Cambios de identidad posteriores al montaje: mismo camino que `identify`/`logout` del loader. El JWT
  // pasa por el mismo parser estricto del protocolo (forma de JWT y tamano), no por una validacion aparte.
  const lastIdentity = React.useRef(identity ?? undefined)
  React.useEffect(() => {
    const next = identity ?? undefined
    if (next === lastIdentity.current) return
    lastIdentity.current = next
    if (!next) local.emit({ t: 'logout' })
    else {
      const msg = parseToFrame({ mcs: 1, t: 'identify', token: next })
      if (msg) local.emit(msg)
    }
  }, [identity, local])

  const overrides = React.useMemo<DisplaySettings>(
    () =>
      normalizeSettings({
        mode: props.mode,
        height: props.height,
        width: props.width,
        offset: props.offset,
        position: props.position,
        shape: props.launcherShape,
        label: props.launcherLabel,
      }),
    [props.mode, props.height, props.width, props.offset, props.position, props.launcherShape, props.launcherLabel],
  )
  const settings = React.useMemo(() => mergeSettings(profile ? settingsFromProfile(profile) : undefined, overrides), [profile, overrides])
  const mode: DisplayMode | undefined = overrides.mode ?? (profile ? (settings.mode ?? 'floating') : undefined)

  // El frame cuenta como no leido lo que llega con el panel cerrado; en `inline` siempre esta a la vista.
  React.useEffect(() => {
    local.emit({ t: open || mode === 'inline' ? 'open' : 'close' })
  }, [open, mode, local])

  // `push`: empuja el contenido de la pagina mientras esta abierto y lo restaura al cerrar o desmontar.
  const pusher = React.useMemo(() => createPagePusher(document), [])
  React.useEffect(() => {
    if (mode === 'push' && open) pusher.push(settings.position === 'bottom-left' ? 'left' : 'right', settings.width ?? DISPLAY_LIMITS.width.def)
    else pusher.restore()
    return () => pusher.restore()
  }, [mode, open, settings.position, settings.width, pusher])

  if (gone) return null

  const brand = profile ? { color: profile.brand_color, on: profile.on_brand } : null
  const text = settings.label ?? profile?.launcher ?? ''
  const hiddenUntilKnown: Styles = { display: 'none' }
  const panelStyle: Styles =
    mode === 'inline'
      ? inlinePanelStyle(settings)
      : mode === 'push'
        ? pushPanelStyle(settings, open)
        : mode === 'floating'
          ? floatingPanelStyle(settings, open)
          : hiddenUntilKnown

  return (
    <>
      <div ref={setRootEl} className={className} data-metacore-support-embed={mode ?? ''} style={{ ...PANEL_BASE, ...panelStyle }}>
        {rootEl ? (
          <I18nextProvider i18n={i18n}>
            <SupportFrame
              embed={embed}
              apiBase={apiBase}
              locale={locale}
              port={local.port}
              identity={identityRef}
              allowReopen={allowReopen}
              prefersDark={typeof window !== 'undefined' && (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)}
              root={rootEl}
              mode={mode}
              fill
            />
          </I18nextProvider>
        ) : null}
      </div>
      {mode === 'floating' ? (
        <button type="button" aria-expanded={open} aria-label={text || 'Support'} style={floatingLauncherStyle(settings, brand)} onClick={() => setOpen(!open)}>
          {text}
        </button>
      ) : null}
      {mode === 'push' ? (
        <button
          type="button"
          aria-expanded={open}
          aria-label={text || 'Support'}
          style={pushLauncherStyle(settings, open, brand, typeof window === 'undefined' ? 0 : window.innerWidth)}
          onClick={() => setOpen(!open)}
        >
          <span style={railChevronStyle}>{railChevron(settings, open)}</span>
          {text ? <span style={railLabelStyle(settings)}>{text}</span> : null}
        </button>
      ) : null}
    </>
  )
}

/** Control imperativo de un embed montado con `mountSupportEmbed`. */
export interface SupportEmbedHandle {
  open(): void
  close(): void
  toggle(): void
  /** Identifica con el JWT firmado por tu servidor, o `null` para volver a anonimo. */
  identify(token: string | null): void
  /** Cambia opciones (modo, medidas, idioma…). */
  update(next: Partial<SupportEmbedOptions>): void
  unmount(): void
}

/**
 * Monta el embed en `el` sin que quien llama tenga que usar React (React va como dependencia del
 * paquete). Para `floating` y `push` el contenedor puede ser cualquier elemento: el panel y el
 * lanzador son `position: fixed`.
 */
export function mountSupportEmbed(el: HTMLElement, opts: SupportEmbedOptions): SupportEmbedHandle {
  const root: Root = createRoot(el)
  let current: SupportEmbedOptions = { ...opts }
  let open = !!opts.open
  let live = true
  const render = () => {
    if (!live) return
    root.render(
      <SupportEmbed
        {...current}
        open={open}
        onOpenChange={(next) => {
          open = next
          current.onOpenChange?.(next)
          render()
        }}
      />,
    )
  }
  render()
  const setOpen = (next: boolean) => {
    if (open === next) return
    open = next
    current.onOpenChange?.(next)
    render()
  }
  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    identify: (token) => {
      current = { ...current, identity: token }
      render()
    },
    update: (next) => {
      current = { ...current, ...next }
      render()
    },
    unmount: () => {
      live = false
      root.unmount()
    },
  }
}
