/**
 * Clases de color semántico del tema (una sola fuente). Los tonos salen de `@asteby/metacore-theme/tones.css`
 * (`--tone-*` + derivadas `-soft/-border/-text`): cambiar marca, pack o modo recolorea todo sin tocar componentes.
 * No uses clases de paleta cruda (text-green-500…) ni colores literales: usa un `Tone`.
 * Cada clase va literal para que Tailwind la detecte.
 */
export type Tone = 'muted' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

export const TONES: readonly Tone[] = ['muted', 'brand', 'success', 'warning', 'danger', 'info']

/**
 * soft   fondo de baja opacidad + borde + texto (insignias, alertas, filas resaltadas)
 * text   solo el texto del tono (valores, deltas, iconos)
 * tint   fondo de baja opacidad sin borde (contadores, filas)
 * bar    relleno sólido (barras de progreso, puntos)
 * border borde del tono (acentos laterales, anillos)
 */
export type ToneVariant = 'soft' | 'text' | 'tint' | 'bar' | 'border'

const MAP: Record<ToneVariant, Record<Tone, string>> = {
  soft: {
    muted: 'bg-tone-muted-soft border border-tone-muted-border text-tone-muted-text',
    brand: 'bg-tone-brand-soft border border-tone-brand-border text-tone-brand-text',
    success: 'bg-tone-success-soft border border-tone-success-border text-tone-success-text',
    warning: 'bg-tone-warning-soft border border-tone-warning-border text-tone-warning-text',
    danger: 'bg-tone-danger-soft border border-tone-danger-border text-tone-danger-text',
    info: 'bg-tone-info-soft border border-tone-info-border text-tone-info-text',
  },
  text: {
    muted: 'text-tone-muted-text',
    brand: 'text-tone-brand-text',
    success: 'text-tone-success-text',
    warning: 'text-tone-warning-text',
    danger: 'text-tone-danger-text',
    info: 'text-tone-info-text',
  },
  tint: {
    muted: 'bg-tone-muted-soft text-tone-muted-text',
    brand: 'bg-tone-brand-soft text-tone-brand-text',
    success: 'bg-tone-success-soft text-tone-success-text',
    warning: 'bg-tone-warning-soft text-tone-warning-text',
    danger: 'bg-tone-danger-soft text-tone-danger-text',
    info: 'bg-tone-info-soft text-tone-info-text',
  },
  bar: {
    muted: 'bg-tone-muted',
    brand: 'bg-tone-brand',
    success: 'bg-tone-success',
    warning: 'bg-tone-warning',
    danger: 'bg-tone-danger',
    info: 'bg-tone-info',
  },
  border: {
    muted: 'border-tone-muted-border',
    brand: 'border-tone-brand-border',
    success: 'border-tone-success-border',
    warning: 'border-tone-warning-border',
    danger: 'border-tone-danger-border',
    info: 'border-tone-info-border',
  },
}

/** Nombres heredados o de configuración -> `Tone` canónico (incluye el vocabulario de genui: `default`). */
const ALIAS: Record<string, Tone> = {
  default: 'muted',
  neutral: 'muted',
  slate: 'muted',
  primary: 'brand',
  orange: 'warning',
  yellow: 'warning',
  amber: 'warning',
  blue: 'info',
  green: 'success',
  emerald: 'success',
  red: 'danger',
  destructive: 'danger',
}

/** Normaliza un nombre de tono al canónico; lo desconocido cae a `fallback` (nunca lanza). */
export function toTone(name: string | undefined | null, fallback: Tone = 'muted'): Tone {
  if (!name) return fallback
  if ((TONES as readonly string[]).includes(name)) return name as Tone
  return ALIAS[name] ?? fallback
}

/** Clases del tono para una variante. Un nombre desconocido cae a `muted`. */
export function toneClasses(tone: Tone | string | undefined, variant: ToneVariant = 'soft'): string {
  return MAP[variant][toTone(tone)]
}

/** Variable CSS del tono sólido (SVG/recharts: stroke/fill). Se resuelve en vivo con el tema. */
export const toneVar = (tone: Tone | string | undefined): string => `var(--tone-${toTone(tone)})`
