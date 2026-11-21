import type { ReactNode } from 'react'
import { Button, cn } from '@asteby/metacore-ui'

export interface BlockStateLabels {
  loading: string
  error: string
  retry: string
  empty: string
}
export const BLOCK_STATE_LABELS: BlockStateLabels = { loading: 'Cargando', error: 'No se pudo cargar.', retry: 'Reintentar', empty: 'Sin datos' }

export type BlockStateKind = 'loading' | 'error' | 'empty'

export interface BlockStateProps {
  kind: BlockStateKind
  /** Texto propio (error de la fuente, vacio configurado). Sin el, el de `labels`. */
  message?: ReactNode
  onRetry?: () => void
  labels?: Partial<BlockStateLabels>
  /** Alto minimo en px: el estado ocupa lo mismo que el contenido para no mover el layout. */
  minHeight?: number
  className?: string
}

/**
 * Estado de un bloque (cargando / error con reintento / vacio). Una sola pieza para todo bloque de
 * tablero: mismo alto minimo en los tres estados (sin salto de layout), `role=status` o `role=alert`,
 * y el pulso se apaga con `prefers-reduced-motion`.
 */
export function BlockState({ kind, message, onRetry, labels, minHeight = 96, className }: BlockStateProps) {
  const l = { ...BLOCK_STATE_LABELS, ...labels }
  const style = { minHeight }
  if (kind === 'loading') return <div role='status' aria-busy='true' aria-label={l.loading} data-genui-block='state-loading' style={style} className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)} />
  if (kind === 'error')
    return (
      <div role='alert' data-genui-block='state-error' style={style} className={cn('flex flex-col items-start justify-center gap-2 text-sm', className)}>
        <p className='m-0'>{message ?? l.error}</p>
        {onRetry ? (
          <Button size='sm' variant='secondary' onClick={onRetry}>
            {l.retry}
          </Button>
        ) : null}
      </div>
    )
  return (
    <p data-genui-block='state-empty' style={style} className={cn('m-0 flex items-center text-sm text-muted-foreground', className)}>
      {message ?? l.empty}
    </p>
  )
}
