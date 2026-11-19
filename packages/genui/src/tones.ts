import type { Tone } from './types'

/** Tono -> variante de `Badge` del SDK UI (un solo mapeo para todo genui). */
export const BADGE_VARIANT: Record<Tone, 'muted' | 'info' | 'success' | 'warning' | 'danger' | 'secondary'> = {
  default: 'secondary',
  muted: 'muted',
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
}

/** Tono -> clase de color de texto (con los tokens del tema, sin colores fijos). */
export const TEXT_TONE: Record<Tone, string> = {
  default: 'text-foreground',
  muted: 'text-muted-foreground',
  info: 'text-[var(--info,oklch(0.55_0.13_235))]',
  success: 'text-[var(--success,oklch(0.6_0.15_155))]',
  warning: 'text-[var(--warning,oklch(0.6_0.15_65))]',
  danger: 'text-destructive',
}

/** Tono declarado -> tono conocido (lo desconocido cae a `default`). */
export function toTone(v: unknown): Tone {
  return typeof v === 'string' && Object.hasOwn(BADGE_VARIANT, v) ? (v as Tone) : 'default'
}
