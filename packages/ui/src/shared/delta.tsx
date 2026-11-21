import * as React from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { toneClasses } from './tone'

export type DeltaProps = {
  /** Ya es un porcentaje (12.5 = +12.5 %). `null`/`undefined`/NaN no pinta nada. */
  value: number | null | undefined
  /** Métricas donde bajar es bueno (devoluciones, tiempos). */
  invert?: boolean
  digits?: number
  className?: string
  /** Periodo de comparación para lectores de pantalla ("vs. mes anterior"). */
  children?: React.ReactNode
}

/** Variación porcentual con icono y tono (sube = success, baja = danger). Anuncia "sube/baja X por ciento". */
export function Delta({ value, invert, digits = 1, className, children }: DeltaProps) {
  const { t } = useTranslation()
  if (value === null || value === undefined || Number.isNaN(value)) return null
  const up = value > 0
  const flat = value === 0
  const good = up !== !!invert
  const tone = flat ? 'muted' : good ? 'success' : 'danger'
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight
  const abs = Math.abs(value).toFixed(digits)
  const direction = flat
    ? t('ui.delta.flat', { defaultValue: 'sin cambio' })
    : up
      ? t('ui.delta.up', { defaultValue: 'sube' })
      : t('ui.delta.down', { defaultValue: 'baja' })
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', toneClasses(tone, 'soft'), className)}>
      <Icon className='size-3.5' aria-hidden />
      <span aria-hidden>
        {up ? '+' : flat ? '' : '−'}
        {abs}%
      </span>
      <span className='sr-only'>
        {direction} {abs} {t('ui.delta.percent', { defaultValue: 'por ciento' })} {children}
      </span>
    </span>
  )
}
