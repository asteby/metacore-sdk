import { useId, useState, type ReactNode } from 'react'
import { BarChart3, Table2 } from 'lucide-react'
import { cn } from '@asteby/metacore-ui'
import { BlockState, type BlockStateKind, type BlockStateLabels } from './block-state'

export interface SeriesColumn {
  key: string
  label: string
  /** Formatea la celda (el host pasa `formatMetric`/su Intl). Sin el: `String(valor)`. */
  format?: (value: unknown) => string
}

export interface SeriesRow {
  /** Etiqueta del periodo/categoria (primera columna, `<th scope=row>`). */
  label: string
  [key: string]: unknown
}

export interface SeriesViewLabels {
  chart: string
  table: string
  period: string
  view: string
}
export const SERIES_VIEW_LABELS: SeriesViewLabels = { chart: 'Grafica', table: 'Tabla', period: 'Periodo', view: 'Vista' }

export interface SeriesViewProps {
  /** Nombre accesible de la grafica y su tabla (el titulo del widget). */
  title: string
  columns: ReadonlyArray<SeriesColumn>
  rows: ReadonlyArray<SeriesRow>
  /** La grafica (cualquier libreria: `@asteby/metacore-charts`, recharts...). Se monta solo en vista grafica. */
  chart: ReactNode
  /** Vista controlada; sin ella el componente la guarda. */
  view?: 'chart' | 'table'
  onViewChange?: (view: 'chart' | 'table') => void
  /** Alto del cuerpo en px; la grafica y la tabla comparten alto (sin salto al cambiar). */
  height?: number
  state?: BlockStateKind
  stateMessage?: ReactNode
  onRetry?: () => void
  stateLabels?: Partial<BlockStateLabels>
  labels?: Partial<SeriesViewLabels>
  className?: string
}

/**
 * Serie con vista en tabla (WCAG 1.1.1 / 1.3.1): la grafica nunca es la unica via a los datos. En vista
 * grafica la tabla sigue en el DOM solo para lectores de pantalla; el conmutador es un grupo de botones
 * con `aria-pressed`. Grafica y tabla comparten alto: cambiar de vista no mueve la pagina.
 */
export function SeriesView({ title, columns, rows, chart, view, onViewChange, height = 260, state, stateMessage, onRetry, stateLabels, labels, className }: SeriesViewProps) {
  const l = { ...SERIES_VIEW_LABELS, ...labels }
  const [local, setLocal] = useState<'chart' | 'table'>('chart')
  const current = view ?? local
  const uid = useId()
  const set = (v: 'chart' | 'table') => (view === undefined && setLocal(v), onViewChange?.(v))
  if (state) return <BlockState kind={state} message={stateMessage} onRetry={onRetry} labels={stateLabels} minHeight={height} className={className} />
  if (rows.length === 0) return <BlockState kind='empty' message={stateMessage} labels={stateLabels} minHeight={height} className={className} />
  const showTable = current === 'table'
  return (
    <figure data-genui-block='series-view' data-view={current} className={cn('m-0 flex flex-col gap-2', className)}>
      <div role='group' aria-label={l.view} className='flex justify-end gap-1'>
        {(['chart', 'table'] as const).map((v) => {
          const Icon = v === 'chart' ? BarChart3 : Table2
          const on = current === v
          return (
            <button
              key={v}
              type='button'
              aria-pressed={on}
              aria-controls={`${uid}-body`}
              onClick={() => set(v)}
              className={cn('inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring', on ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <Icon className='size-3.5' aria-hidden />
              {v === 'chart' ? l.chart : l.table}
            </button>
          )
        })}
      </div>
      <div id={`${uid}-body`} style={{ height }} className={cn('min-h-0', showTable && 'overflow-auto')}>
        {showTable ? null : chart}
        <table className={showTable ? 'w-full text-sm' : 'sr-only'}>
          <caption className='sr-only'>{title}</caption>
          <thead>
            <tr className='border-b text-left text-muted-foreground'>
              <th scope='col' className='py-2 font-medium'>
                {l.period}
              </th>
              {columns.map((c) => (
                <th key={c.key} scope='col' className='py-2 text-right font-medium'>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className='border-b border-border/50'>
                <th scope='row' className='py-1.5 text-left font-normal'>
                  {r.label}
                </th>
                {columns.map((c) => (
                  <td key={c.key} className='py-1.5 text-right tabular-nums'>
                    {c.format ? c.format(r[c.key]) : r[c.key] === undefined || r[c.key] === null ? '—' : String(r[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
