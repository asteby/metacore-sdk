import type { ReactNode } from 'react'
import { cn } from '@asteby/metacore-ui'
import { Badge } from '@asteby/metacore-ui'
import { BlockState, type BlockStateKind } from './block-state'
import { BADGE_VARIANT, TEXT_TONE } from '../tones'
import type { Tone } from '../types'

export interface RankedItem {
  /** Estable: es la `key` de React y lo que recibe `onSelect`. */
  id: string
  label: string
  sub?: string
  /** Valor ya formateado, alineado a la derecha con cifras tabulares. */
  value?: ReactNode
  /** Proporcion 0-1 respecto al mayor: dibuja una barra fina bajo el texto. */
  share?: number
  tone?: Tone
  /** Insignia corta junto al titulo (estado, categoria). */
  badge?: string
  /** Enlace real (navegacion con teclado y "abrir en pestana"). */
  href?: string
}

export interface RankedListProps {
  items: ReadonlyArray<RankedItem>
  /** Numera las filas; la 1.a con el acento de marca y las demas neutras. */
  ranked?: boolean
  /** Nombre accesible de la lista. */
  label: string
  /** Alto maximo en px: scroll interno alcanzable con teclado. */
  maxHeight?: number
  onSelect?: (item: RankedItem) => void
  state?: BlockStateKind
  stateMessage?: ReactNode
  onRetry?: () => void
  retryLabel?: string
  /** Texto del estado vacio. */
  emptyText?: ReactNode
  className?: string
}

/** A partir de este numero de filas se difiere el pintado de las que estan fuera de pantalla (`content-visibility`). */
export const RANKED_LAZY_ROWS = 40

function Row({ item, n, ranked, lazy, onSelect }: { item: RankedItem; n: number; ranked?: boolean; lazy: boolean; onSelect?: (i: RankedItem) => void }) {
  const tone: Tone = item.tone ?? 'default'
  const body = (
    <>
      {ranked ? (
        <span aria-label={`Posicion ${n}`} className={cn('flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums', n === 1 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
          {n}
        </span>
      ) : null}
      <span className='min-w-0 flex-1'>
        <span className='flex items-center gap-2'>
          <span className='truncate text-sm font-medium'>{item.label}</span>
          {item.badge ? (
            <Badge variant={BADGE_VARIANT[tone]} className='shrink-0'>
              {item.badge}
            </Badge>
          ) : null}
        </span>
        {item.sub ? <span className='block truncate text-xs text-muted-foreground'>{item.sub}</span> : null}
        {typeof item.share === 'number' && Number.isFinite(item.share) ? (
          <span aria-hidden className='mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-muted'>
            <span className={cn('block h-1 rounded-full bg-current', item.tone ? TEXT_TONE[tone] : 'text-primary')} style={{ width: `${Math.round(Math.min(1, Math.max(0, item.share)) * 100)}%` }} />
          </span>
        ) : null}
      </span>
      {item.value !== undefined ? <span className='shrink-0 text-sm font-semibold tabular-nums'>{item.value}</span> : null}
    </>
  )
  const cls = 'flex w-full items-center gap-3 rounded-xl p-2.5 text-left no-underline outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring'
  const interactive = item.href ? (
    <a href={item.href} className={cn(cls, 'text-inherit hover:bg-muted/60')} onClick={onSelect ? (e) => (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 ? undefined : (e.preventDefault(), onSelect(item))) : undefined}>
      {body}
    </a>
  ) : onSelect ? (
    <button type='button' className={cn(cls, 'bg-transparent hover:bg-muted/60')} onClick={() => onSelect(item)}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
  return (
    <li data-id={item.id} style={lazy ? { contentVisibility: 'auto', containIntrinsicSize: 'auto 52px' } : undefined}>
      {interactive}
    </li>
  )
}

/**
 * Ranking / lista de registros de tablero: posicion opcional, titulo, subtitulo, insignia, barra de
 * proporcion y valor; las filas con `href` son enlaces reales. Con muchas filas difiere el pintado de
 * las ocultas sin cambiar el alto del contenedor. Estados cargando/error/vacio con el mismo marco.
 */
export function RankedList({ items, ranked, label, maxHeight, onSelect, state, stateMessage, onRetry, retryLabel, emptyText, className }: RankedListProps) {
  if (state) return <BlockState kind={state} message={stateMessage} onRetry={onRetry} retryLabel={retryLabel} className={className} />
  if (items.length === 0) return <BlockState kind='empty' message={emptyText} retryLabel={retryLabel} className={className} />
  const scroll = maxHeight !== undefined
  const lazy = items.length > RANKED_LAZY_ROWS
  const list = (
    <ul aria-label={label} data-genui-block='ranked-list' className={cn('m-0 flex list-none flex-col gap-1 p-0', !scroll && className)}>
      {items.map((it, i) => (
        <Row key={it.id} item={it} n={i + 1} ranked={ranked} lazy={lazy} onSelect={onSelect} />
      ))}
    </ul>
  )
  // Una region con scroll debe poder enfocarse para recorrerse con teclado; el rol va en el contenedor para no perder la semantica de lista.
  return scroll ? (
    <div role='region' aria-label={label} tabIndex={0} style={{ maxHeight }} className={cn('overflow-y-auto rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}>
      {list}
    </div>
  ) : (
    list
  )
}
