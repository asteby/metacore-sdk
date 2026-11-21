import * as React from 'react'
import { cn } from '@/lib/utils'
import { Delta } from './delta'
import { toneClasses, type Tone } from './tone'

export interface KpiCardProps {
  label: string
  /** Valor ya formateado. */
  value: React.ReactNode
  /** Valor exacto para el tooltip nativo. */
  title?: string
  /** Icono (nodo, p. ej. `<DynamicIcon/>` o lucide) dentro de un contenedor con el color de significado (`iconTone`). */
  icon?: React.ReactNode
  /** Variación porcentual contra el periodo anterior. */
  delta?: number | null
  deltaInvert?: boolean
  /** Periodo de la variación (lectores de pantalla). */
  deltaLabel?: React.ReactNode
  /** Línea bajo el valor. */
  hint?: React.ReactNode
  /** Gráfica opcional bajo el valor (p. ej. `<Sparkline responsive endDot/>` de metacore-charts). Solo con `hero`. */
  chart?: React.ReactNode
  /** Tarjeta grande (valor mayor, gráfica) o compacta. */
  hero?: boolean
  /** Tono del icono (color de significado). */
  iconTone?: Tone
  /** La cifra héroe de la vista (una sola): >= 48 px y brillo de marca sutil. */
  glow?: boolean
  /** Es un enlace: se eleva al hover. */
  interactive?: boolean
  /** Nombre accesible del grupo (si se omite: etiqueta + valor). */
  ariaLabel?: string
  className?: string
  testId?: string
}

/**
 * KpiCard / StatTile: etiqueta pequeña en muted, valor grande, variación (+/− con icono), pista y gráfica opcional.
 * Superficie en capas del tema (`dash-surface`, de metacore-theme/tones.css). Jerarquía por tamaño y peso; el color solo
 * aparece en el icono de significado, la variación y la serie.
 */
export function KpiCard({ label, value, title, icon, delta, deltaInvert, deltaLabel, hint, chart, hero, iconTone = 'muted', glow, interactive, ariaLabel, className, testId }: KpiCardProps) {
  return (
    <article
      role='group'
      aria-label={ariaLabel ?? `${label}: ${title ?? (typeof value === 'string' || typeof value === 'number' ? value : '')}`}
      data-testid={testId}
      className={cn('dash-surface text-card-foreground flex h-full flex-col justify-between gap-3 rounded-2xl', glow && 'dash-glow', interactive && 'dash-surface-hover', hero ? 'p-5' : 'p-4 sm:p-5', className)}
    >
      <div className='flex min-w-0 items-center gap-2.5'>
        {icon ? (
          <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-lg [&>svg]:size-[18px]', toneClasses(iconTone, 'tint'), hero ? 'size-9' : 'size-8')}>
            {icon}
          </span>
        ) : null}
        <p className='text-muted-foreground truncate text-sm font-medium'>{label}</p>
      </div>
      <div className='min-w-0'>
        <div className='flex items-end justify-between gap-2'>
          <p title={title} className={cn('truncate font-semibold tracking-tight', glow ? 'text-4xl sm:text-5xl' : hero ? 'text-3xl sm:text-4xl' : 'text-2xl')}>
            {value}
          </p>
          {delta !== undefined && delta !== null ? (
            <Delta value={delta} invert={deltaInvert} className='mb-1'>
              {deltaLabel}
            </Delta>
          ) : null}
        </div>
        {hint ? <div className='text-muted-foreground mt-1 flex flex-wrap items-center gap-x-1.5 text-xs'>{hint}</div> : null}
      </div>
      {hero && chart ? <div className='h-10 w-full'>{chart}</div> : null}
    </article>
  )
}
