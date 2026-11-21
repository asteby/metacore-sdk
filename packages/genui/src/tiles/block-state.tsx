import type { ReactNode } from 'react'
import { DataState, cn } from '@asteby/metacore-ui'

export type BlockStateKind = 'loading' | 'error' | 'empty'

export interface BlockStateProps {
  kind: BlockStateKind
  /** Texto propio (error de la fuente, vacio configurado). Sin el, el de `DataState` (i18n `data_state.*`). */
  message?: ReactNode
  onRetry?: () => void
  retryLabel?: string
  /** Alto minimo en px: el estado ocupa lo mismo que el contenido para no mover el layout. */
  minHeight?: number
  /** Valor de `data-genui-block` (contrato con pruebas y hosts: `source-loading`, `section-error`...). Por omision `state-<kind>`. */
  marker?: string
  className?: string
}

/**
 * Estado de un bloque de tablero (cargando / error con reintento / vacio): `DataState` del kit de UI
 * (roles, i18n y movimiento reducido ya resueltos) con un alto minimo fijo, para que pasar de un estado
 * al contenido no mueva la pagina.
 */
export function BlockState({ kind, message, onRetry, retryLabel, minHeight = 96, marker, className }: BlockStateProps) {
  return (
    <div style={{ minHeight }} className={cn('flex items-center justify-center', className)} data-genui-block={marker ?? `state-${kind}`}>
      <DataState kind={kind} compact title={message} onRetry={kind === 'error' ? onRetry : undefined} retryLabel={retryLabel} />
    </div>
  )
}
