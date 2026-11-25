/**
 * Tema del frame: el color de marca se aplica como token (`--primary`) de `@asteby/metacore-theme`
 * por CSSOM (`style.setProperty`), nunca como CSS propio ni atributo `style` en texto, asi que
 * respeta la CSP `style-src 'self'` del frame. El texto sobre la marca sale de `onColor` (AA).
 */
import { ensureContrast, onColor } from '@asteby/metacore-theme'
import type { SafeProfile } from './profile'

const DARK_SURFACE = '#09090b'

export interface AppliedTheme {
  dark: boolean
  /** Marca y texto sobre la marca, `#rrggbb`, para el lanzador del loader. */
  brand?: { color: string; on: string }
}

export function applyProfileTheme(profile: SafeProfile, root: HTMLElement, prefersDark: boolean): AppliedTheme {
  const dark = profile.appearance === 'dark' || (profile.appearance === 'auto' && prefersDark)
  root.classList.toggle('dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
  if (!profile.brand_color) {
    root.style.removeProperty('--primary')
    root.style.removeProperty('--primary-foreground')
    return { dark }
  }
  // En oscuro se sube la luminosidad hasta ser legible contra la superficie oscura.
  const color = dark ? ensureContrast(profile.brand_color, DARK_SURFACE, 4.5, { format: 'hex' }) : profile.brand_color
  const on = onColor(color)
  root.style.setProperty('--primary', color)
  root.style.setProperty('--primary-foreground', on)
  return { dark, brand: { color, on } }
}
