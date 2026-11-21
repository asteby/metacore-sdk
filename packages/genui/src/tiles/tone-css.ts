// Tonos semanticos de los bloques de tablero. Solo variables CSS con respaldo: cuando el tema
// publique `--tone-<tono>` / `--tone-<tono>-text` / `--tone-<tono>-soft` se usan solas; mientras
// tanto caen a los tokens que ya existen (`--success`, `--destructive`, `--primary`...). Nada de
// colores crudos de paleta.
import type { Tone } from '../types'

export type TileTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
export const TILE_TONES: readonly TileTone[] = ['neutral', 'primary', 'success', 'warning', 'danger', 'info']

const FALLBACK: Record<TileTone, string> = {
  neutral: 'var(--muted-foreground)',
  primary: 'var(--primary)',
  success: 'var(--success, oklch(0.6 0.15 155))',
  warning: 'var(--warning, oklch(0.6 0.15 65))',
  danger: 'var(--destructive)',
  info: 'var(--info, oklch(0.55 0.13 235))',
}

const ALIAS: Record<string, TileTone> = {
  default: 'neutral',
  muted: 'neutral',
  slate: 'neutral',
  brand: 'primary',
  green: 'success',
  emerald: 'success',
  orange: 'warning',
  yellow: 'warning',
  amber: 'warning',
  red: 'danger',
  destructive: 'danger',
  blue: 'info',
}

/** Nombre de tono (genui `Tone`, canonico o alias heredado) -> tono del tile. Lo desconocido es `neutral`. */
export function toTileTone(name: Tone | string | null | undefined, fallback: TileTone = 'neutral'): TileTone {
  if (!name) return fallback
  if ((TILE_TONES as readonly string[]).includes(name)) return name as TileTone
  return Object.hasOwn(ALIAS, name) ? ALIAS[name]! : fallback
}

/** Color solido del tono (texto, trazos SVG, puntos). */
export const toneColor = (tone: TileTone): string => `var(--tone-${tone}-text, var(--tone-${tone}, ${FALLBACK[tone]}))`
/** Fondo suave del tono (burbujas de icono, insignias). */
export const toneSoft = (tone: TileTone): string => `var(--tone-${tone}-soft, color-mix(in oklab, ${FALLBACK[tone]} 14%, transparent))`
