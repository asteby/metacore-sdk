/**
 * Protocolo `postMessage` entre el loader (sitio de la empresa) y el frame (iframe del Hub).
 *
 * Ambos extremos ignoran cualquier mensaje que no traiga el sobre `{ mcs: 1, t: … }` valido y que
 * no venga de la ventana y el origen esperados. Aqui solo viven los tipos y el parseo estricto:
 * el control de origen esta en `loader.ts` y `frame-port.ts`. Nunca se usa `targetOrigin: "*"`.
 */
import { asMode, asPosition, parseProfileDisplay, type DisplayMode, type LauncherPosition, type LauncherShape, type ProfileDisplay } from './display'

export const PROTOCOL_VERSION = 1

export type { DisplayMode, LauncherPosition, LauncherShape }

export type { ProfileDisplay }

/** Loader -> frame. `mode` es el modo con el que el loader presenta el iframe (el frame oculta el boton de cerrar en `inline`). */
export type ToFrame =
  | { t: 'hello'; locale?: string; mode?: DisplayMode }
  | { t: 'identify'; token: string }
  | { t: 'open' }
  | { t: 'close' }
  | { t: 'logout' }

/** Frame -> loader. `profile` solo lleva valores ya validados. */
export type ToParent =
  | { t: 'ready' }
  | ({ t: 'profile'; position: LauncherPosition; launcher: string; brand_color: string; on_brand: string } & ProfileDisplay)
  | { t: 'unread'; count: number }
  | { t: 'unavailable' }
  | { t: 'close' }

const HEX = /^#[0-9a-fA-F]{6}$/
/** El JWT de identidad son tres segmentos base64url; no se acepta otra cosa ni mas de 4 KiB. */
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/
export const MAX_TOKEN_LENGTH = 4096

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export const envelope = (msg: ToFrame | ToParent): { mcs: number } & (ToFrame | ToParent) => ({ mcs: PROTOCOL_VERSION, ...msg })

export function parseToFrame(data: unknown): ToFrame | null {
  if (!isRecord(data) || data.mcs !== PROTOCOL_VERSION) return null
  switch (data.t) {
    case 'hello':
      return {
        t: 'hello',
        locale: typeof data.locale === 'string' && data.locale.length <= 35 ? data.locale : undefined,
        mode: asMode(data.mode),
      }
    case 'identify':
      return typeof data.token === 'string' && data.token.length <= MAX_TOKEN_LENGTH && JWT.test(data.token) ? { t: 'identify', token: data.token } : null
    case 'open':
    case 'close':
    case 'logout':
      return { t: data.t }
    default:
      return null
  }
}

export function parseToParent(data: unknown): ToParent | null {
  if (!isRecord(data) || data.mcs !== PROTOCOL_VERSION) return null
  switch (data.t) {
    case 'ready':
    case 'unavailable':
    case 'close':
      return { t: data.t }
    case 'unread':
      return typeof data.count === 'number' && Number.isInteger(data.count) && data.count >= 0 && data.count <= 999 ? { t: 'unread', count: data.count } : null
    case 'profile': {
      const { launcher, brand_color, on_brand } = data
      const position = asPosition(data.position)
      if (!position) return null
      if (typeof launcher !== 'string' || launcher.length > 120) return null
      if (typeof brand_color !== 'string' || !HEX.test(brand_color) || typeof on_brand !== 'string' || !HEX.test(on_brand)) return null
      return { t: 'profile', position, launcher, brand_color, on_brand, ...parseProfileDisplay(data) }
    }
    default:
      return null
  }
}
