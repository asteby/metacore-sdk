import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import { createEmbedTransport, type VisitorTokenStore } from '@asteby/metacore-sdk/support'
import { createFrameI18n } from './frame-i18n'
import { createParentPort } from './frame-port'
import { resolveLocale } from './profile'
import { SupportFrame } from './support-frame'

/**
 * Configuracion que el Hub inyecta en el HTML del frame con `<meta name=…>` (nada de esto esta
 * fijado en el paquete):
 *  - `mc-support-session-path`: ruta de `POST` de sesiones (p. ej. `/v1/support/embed/sessions`).
 *  - `mc-support-api-base`: prefijo de la API del widget (p. ej. `/v1/support/embed`).
 *  - `mc-support-base-url` (opcional): base absoluta; vacio = mismo origen.
 *  - `mc-support-allow-reopen` (opcional): `1` si la politica del canal permite reabrir.
 * El id del canal y el idioma llegan por query (`?channel=sch_…&locale=es-MX`).
 */
export const META = {
  sessionPath: 'mc-support-session-path',
  apiBase: 'mc-support-api-base',
  baseUrl: 'mc-support-base-url',
  allowReopen: 'mc-support-allow-reopen',
} as const

const meta = (doc: Document, name: string) => doc.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content || undefined

/** Almacen del token de visitante en el `localStorage` del iframe; ausente o bloqueado = visitante efimero. */
export function localVisitorStore(win: Window, channel: string): VisitorTokenStore {
  const key = `mc:support:vt:${channel}`
  return {
    get: () => {
      try {
        return win.localStorage.getItem(key)
      } catch {
        return null
      }
    },
    set: (t) => {
      try {
        win.localStorage.setItem(key, t)
      } catch {
        // bloqueado (terceros)
      }
    },
    clear: () => {
      try {
        win.localStorage.removeItem(key)
      } catch {
        // idem
      }
    },
  }
}

export interface BootResult {
  root: Root | null
  dispose(): void
}

/** Arranca el frame: espera el primer `hello` valido del padre (su origen), abre sesion y monta la UI. */
export function bootFrame(win: Window, doc: Document, container: HTMLElement): BootResult {
  const port = createParentPort(win)
  const params = new URLSearchParams(win.location.search)
  const channel = params.get('channel') ?? ''
  const sessionPath = meta(doc, META.sessionPath)
  const apiBase = meta(doc, META.apiBase)
  let root: Root | null = null
  const identity: { current: string | undefined } = { current: undefined }

  void port.origin.then((parentOrigin) => {
    if (!channel || !sessionPath || !apiBase) {
      port.send({ t: 'unavailable' })
      return
    }
    const { locale, ui } = resolveLocale({ requested: params.get('locale'), navigatorLanguage: win.navigator.language })
    const i18n = createFrameI18n(ui)
    const embed = createEmbedTransport({
      baseUrl: meta(doc, META.baseUrl),
      channel,
      parentOrigin,
      sessionPath,
      locale,
      identity: () => identity.current,
      visitorToken: localVisitorStore(win, channel),
    })
    root = createRoot(container)
    root.render(
      <I18nextProvider i18n={i18n}>
        <SupportFrame
          embed={embed}
          apiBase={apiBase}
          locale={locale}
          port={port}
          identity={identity}
          allowReopen={meta(doc, META.allowReopen) === '1'}
          mode={port.currentMode()}
          prefersDark={win.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false}
        />
      </I18nextProvider>,
    )
  })

  return {
    get root() {
      return root
    },
    dispose: () => {
      port.dispose()
      root?.unmount()
    },
  }
}
