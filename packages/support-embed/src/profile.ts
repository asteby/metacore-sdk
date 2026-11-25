/**
 * Validacion del `PublicProfile` en el frame. El Hub ya lo valida al guardarlo (contraste AA y host
 * del logo); aqui se repite lo que el contrato fija (`support/contract/profile.go`) porque el perfil
 * llega por red y se aplica al DOM: un campo invalido se descarta, no se aplica ni rompe el resto.
 */
import type { SupportPublicProfile } from '@asteby/metacore-sdk/support'
import { parseProfileDisplay, type DisplayMode, type LauncherShape, type ProfileDisplay } from './display'

/**
 * TODO(kernel feat/support-embed-display-modes): estos campos los anade el contrato del kernel a
 * `PublicProfile`. Cuando esa rama se publique, regenerar `packages/sdk/src/generated/support-contract.ts`
 * con `scripts/gen-support-types.mjs --src <testdata del kernel>` y borrar este tipo manual
 * (`SupportPublicProfile` ya los traera).
 */
export interface PublicProfileDisplayFields {
  display_mode?: DisplayMode | (string & {})
  inline_target?: string
  inline_height?: number
  panel_width?: number
  offset?: number
  launcher_shape?: LauncherShape | (string & {})
  launcher_label?: string
}

export type PublicProfileInput = SupportPublicProfile & PublicProfileDisplayFields

export const PROFILE_LIMITS = {
  maxLocales: 20,
  launcher: 60,
  greeting: 500,
  offline: 500,
  contactUrl: 2048,
} as const

const BRAND_COLOR = /^#[0-9A-Fa-f]{6}$/
const LOCALE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

export interface SafeProfile extends ProfileDisplay {
  version?: number
  brand_color?: string
  appearance: 'auto' | 'light' | 'dark'
  position: 'bottom-right' | 'bottom-left'
  /** Solo https. */
  logo_url?: string
  default_locale?: string
  texts: Record<string, { launcher?: string; greeting?: string; offline?: string }>
  fallback_contact?: { email?: string; url?: string }
  /** Presentacion (todo opcional; ausente = `floating` con los defectos del modo). */
}

const httpsUrl = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string' || v.length === 0 || v.length > max) return undefined
  try {
    const u = new URL(v)
    return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : undefined
  } catch {
    return undefined
  }
}

const text = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.length > 0 && [...v].length <= max ? v : undefined

/** Devuelve el perfil con solo los campos validos y los defectos del contrato para el resto. */
export function sanitizeProfile(raw: PublicProfileInput | null | undefined): SafeProfile {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: SafeProfile = {
    appearance: p.appearance === 'light' || p.appearance === 'dark' ? p.appearance : 'auto',
    position: p.position === 'bottom-left' ? 'bottom-left' : 'bottom-right',
    texts: {},
  }
  if (typeof p.version === 'number' && Number.isInteger(p.version) && p.version >= 0) out.version = p.version
  if (typeof p.brand_color === 'string' && BRAND_COLOR.test(p.brand_color)) out.brand_color = p.brand_color
  const logo = httpsUrl(p.logo_url, PROFILE_LIMITS.contactUrl)
  if (logo) out.logo_url = logo
  if (typeof p.default_locale === 'string' && LOCALE.test(p.default_locale)) out.default_locale = p.default_locale

  Object.assign(out, parseProfileDisplay(p))

  if (p.texts && typeof p.texts === 'object') {
    for (const [loc, t] of Object.entries(p.texts as Record<string, unknown>).slice(0, PROFILE_LIMITS.maxLocales)) {
      if (!LOCALE.test(loc) || !t || typeof t !== 'object') continue
      const o = t as Record<string, unknown>
      const entry = {
        launcher: text(o.launcher, PROFILE_LIMITS.launcher),
        greeting: text(o.greeting, PROFILE_LIMITS.greeting),
        offline: text(o.offline, PROFILE_LIMITS.offline),
      }
      out.texts[loc] = Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined))
    }
  }

  const fc = p.fallback_contact as Record<string, unknown> | undefined
  if (fc && typeof fc === 'object') {
    const email = typeof fc.email === 'string' && fc.email.length <= 254 && EMAIL.test(fc.email) ? fc.email : undefined
    const url = httpsUrl(fc.url, PROFILE_LIMITS.contactUrl)
    if (email || url) out.fallback_contact = { ...(email ? { email } : {}), ...(url ? { url } : {}) }
  }
  return out
}

/** Textos del idioma pedido: exacto (`es-MX`), mismo idioma (`es-*`) o el `default_locale`. */
export function profileTexts(profile: SafeProfile, locale: string): { launcher?: string; greeting?: string; offline?: string } {
  const lang = locale.toLowerCase().split('-')[0]
  const keys = Object.keys(profile.texts)
  const pick =
    keys.find((k) => k.toLowerCase() === locale.toLowerCase()) ??
    keys.find((k) => k.toLowerCase().split('-')[0] === lang) ??
    (profile.default_locale ? keys.find((k) => k === profile.default_locale) : undefined)
  return pick ? (profile.texts[pick] ?? {}) : {}
}

/**
 * Idioma del frame (§4.5): `data-locale` -> `navigator.language` -> `default_locale` del perfil ->
 * `es-MX`. Devuelve el idioma completo y el de la UI (`es` | `en`).
 */
export function resolveLocale(opts: { requested?: string | null; navigatorLanguage?: string | null; profileDefault?: string | null }): {
  locale: string
  ui: 'es' | 'en'
} {
  const locale = [opts.requested, opts.navigatorLanguage, opts.profileDefault].find((l) => !!l && LOCALE.test(l)) ?? 'es-MX'
  return { locale, ui: locale.toLowerCase().startsWith('en') ? 'en' : 'es' }
}
