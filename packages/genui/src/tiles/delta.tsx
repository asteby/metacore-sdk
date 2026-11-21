import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@asteby/metacore-ui'
import { toneColor, toneSoft } from './tone-css'

export interface DeltaLabels {
  up: string
  down: string
  flat: string
  /** `por ciento` en `sube 12.5 por ciento`. */
  percent: string
}
export const DELTA_LABELS: DeltaLabels = { up: 'sube', down: 'baja', flat: 'sin cambio', percent: 'por ciento' }

export interface DeltaProps {
  /** Ya es un porcentaje: 12.5 = +12.5 %. `null`/`NaN` no pinta nada. */
  value: number | null | undefined
  /** Bajar es bueno (costos, devoluciones): invierte el color, no el signo. */
  invert?: boolean
  digits?: number
  /** Periodo contra el que se compara (se anuncia a lectores de pantalla). */
  children?: ReactNode
  labels?: Partial<DeltaLabels>
  className?: string
}

/** Variacion porcentual con icono, signo y tono. El color nunca es la unica senal: lleva signo, icono y texto para lectores. */
export function Delta({ value, invert, digits = 1, children, labels, className }: DeltaProps) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  const l = { ...DELTA_LABELS, ...labels }
  const flat = value === 0
  const up = value > 0
  const tone = flat ? 'neutral' : up !== !!invert ? 'success' : 'danger'
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight
  const n = Math.abs(value).toFixed(digits)
  return (
    <span data-genui-block='delta' data-tone={tone} className={cn('inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', className)} style={{ color: toneColor(tone), background: toneSoft(tone) }}>
      <Icon className='size-3.5' aria-hidden />
      <span aria-hidden>
        {up ? '+' : flat ? '' : '−'}
        {n}%
      </span>
      <span className='sr-only'>
        {flat ? l.flat : up ? l.up : l.down} {n} {l.percent} {children}
      </span>
    </span>
  )
}
