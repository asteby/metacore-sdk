import type { ReactNode } from 'react'
import { cn } from '@asteby/metacore-ui'
import { BlockState, type BlockStateKind, type BlockStateLabels } from './block-state'
import { Delta, type DeltaLabels } from './delta'
import { TrendSpark } from './spark'
import { toneColor, toneSoft, type TileTone } from './tone-css'

export interface KpiTileProps {
  label: string
  /** Valor ya formateado (usa `formatMetric` del paquete). */
  value: ReactNode
  /** Valor exacto para el tooltip nativo. */
  title?: string
  /** Icono ya resuelto (el host decide el conjunto: `usePageIcon`, lucide...). Decorativo. */
  icon?: ReactNode
  iconTone?: TileTone
  /** Variacion porcentual contra el periodo anterior. */
  delta?: number | null
  deltaInvert?: boolean
  /** Periodo de la variacion (se anuncia: "sube 4 por ciento vs. semana anterior"). */
  deltaContext?: ReactNode
  deltaLabels?: Partial<DeltaLabels>
  /** Linea bajo el valor. */
  hint?: ReactNode
  /** Serie de la mini-grafica (solo con `hero`). */
  spark?: ReadonlyArray<number>
  sparkTone?: TileTone
  /** Tarjeta grande con mini-grafica; si no, compacta. */
  hero?: boolean
  /** Cifra principal de la vista: aun mas grande. Una sola por pantalla. */
  glow?: boolean
  /** Se comporta como enlace (el host la envuelve): eleva al hover. */
  interactive?: boolean
  /** Estado del widget: reemplaza el valor, conserva la tarjeta (mismo alto, sin salto). */
  state?: BlockStateKind
  stateMessage?: ReactNode
  onRetry?: () => void
  stateLabels?: Partial<BlockStateLabels>
  /** Nombre accesible completo del grupo (por omision: etiqueta + valor). */
  ariaLabel?: string
  className?: string
  testId?: string
}

/**
 * KPI de tablero: etiqueta, cifra grande, variacion, pista y mini-grafica. Sin superficie propia mas
 * alla de `bg-card` + borde: el host aporta su vidrio con `className` (p. ej. `dash-surface`). Los
 * estados (cargando, error, vacio) sustituyen solo la cifra: el marco no cambia de alto.
 */
export function KpiTile({ label, value, title, icon, iconTone = 'neutral', delta, deltaInvert, deltaContext, deltaLabels, hint, spark, sparkTone = 'primary', hero, glow, interactive, state, stateMessage, onRetry, stateLabels, ariaLabel, className, testId }: KpiTileProps) {
  return (
    <article
      role='group'
      aria-label={ariaLabel ?? `${label}${typeof value === 'string' || typeof value === 'number' ? `: ${title ?? value}` : ''}`}
      aria-busy={state === 'loading' || undefined}
      data-testid={testId}
      data-genui-block='kpi-tile'
      className={cn('flex h-full flex-col justify-between gap-3 rounded-2xl border bg-card text-card-foreground transition-shadow motion-reduce:transition-none', interactive && 'hover:shadow-md focus-within:shadow-md', hero ? 'p-5' : 'p-4 sm:p-5', className)}
    >
      <div className='flex min-w-0 items-center gap-2.5'>
        {icon ? (
          <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-lg [&_svg]:size-[18px]', hero ? 'size-9' : 'size-8')} style={{ color: toneColor(iconTone), background: toneSoft(iconTone) }}>
            {icon}
          </span>
        ) : null}
        <p className='m-0 truncate text-sm font-medium text-muted-foreground'>{label}</p>
      </div>
      {state ? (
        <BlockState kind={state} message={stateMessage} onRetry={onRetry} labels={stateLabels} minHeight={hero ? 64 : 40} />
      ) : (
        <div className='min-w-0'>
          <div className='flex items-end justify-between gap-2'>
            <p title={title} className={cn('m-0 truncate font-semibold tracking-tight', glow ? 'text-4xl sm:text-5xl' : hero ? 'text-3xl sm:text-4xl' : 'text-2xl')}>
              {value}
            </p>
            <Delta value={delta} invert={deltaInvert} labels={deltaLabels} className='mb-1'>
              {deltaContext}
            </Delta>
          </div>
          {hint ? <div className='mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground'>{hint}</div> : null}
        </div>
      )}
      {hero && !state && spark && spark.length > 1 ? <TrendSpark data={spark} tone={sparkTone} /> : null}
    </article>
  )
}
