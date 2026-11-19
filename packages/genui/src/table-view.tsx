import { useMemo, type ReactNode } from 'react'
import { Badge, Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, cn } from '@asteby/metacore-ui'
import { lookupGenUIIcon, type GenUIIconResolver } from './icons'
import { formatMetric } from './metric'
import { BADGE_VARIANT, TEXT_TONE, toTone } from './tones'
import type { Scalar, TableBlock, UIColumn } from './types'

/** Alto maximo de la tabla con scroll interno: UNICA fuente de los valores de `max_height`. */
export const TABLE_MAX_HEIGHT = { sm: '16rem', md: '24rem', lg: '32rem' } as const

/** Valor de celda sin formato (null -> raya, booleano -> Si/No). */
export const cell = (v: Scalar | undefined) => (v === null || v === undefined ? '—' : typeof v === 'boolean' ? (v ? 'Sí' : 'No') : String(v))

/** `in_progress` / `inProgress` / `ACTIVE` -> "In progress" / "In progress" / "Active". Texto ya legible no se toca. */
export function humanize(value: string): string {
  if (!/^[A-Za-z0-9_.\-]+$/.test(value)) return value
  const spaced = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_.\-]+/g, ' ').trim().toLowerCase()
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : value
}

type Text = (v: unknown) => string
const plainText: Text = (v) => (typeof v === 'string' ? v : '')

export interface TableViewProps {
  block: Omit<TableBlock, 'type'> & { type?: string }
  /** Filas de la fuente del host (las inline del bloque ganan). */
  rows?: Array<Record<string, unknown>>
  /** Resuelve `{ $t }` con el `t` del host. Por defecto solo texto literal. */
  text?: Text
  locale?: string
  currency?: string
  resolveIcon?: GenUIIconResolver
}

interface Ctx {
  text: Text
  locale?: string
  currency?: string
  resolveIcon?: GenUIIconResolver
}

function labelFor(col: UIColumn, raw: unknown, ctx: Ctx): string | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined
  const key = String(raw)
  const entry = col.labels && Object.hasOwn(col.labels, key) ? col.labels[key] : undefined
  if (entry !== undefined) {
    const out = ctx.text(entry)
    // `t` sin traduccion devuelve la clave: nunca se muestra, se humaniza el valor.
    if (out && !(typeof entry === 'object' && out === entry.$t)) return out
  }
  // Solo columnas de insignia/icono humanizan (el texto plano conserva el valor tal cual).
  return typeof raw === 'string' && (col.variant === 'badge' || col.variant === 'icon_text' || col.labels) ? humanize(raw) : undefined
}

function CellIcon({ col, raw, ctx }: { col: UIColumn; raw: unknown; ctx: Ctx }) {
  const name = col.icons && raw !== null && raw !== undefined && Object.hasOwn(col.icons, String(raw)) ? col.icons[String(raw)] : undefined
  const Icon = lookupGenUIIcon(name, ctx.resolveIcon)
  return Icon ? <Icon className='size-3.5 shrink-0' /> : null
}

function CellValue({ col, raw, ctx }: { col: UIColumn; raw: unknown; ctx: Ctx }): ReactNode {
  const variant = col.variant ?? 'text'
  const empty = raw === null || raw === undefined || raw === ''
  let shown: ReactNode = labelFor(col, raw, ctx)
  if (shown === undefined) {
    if (col.format && !empty) {
      const text = formatMetric(raw, col.format, ctx.locale, ctx.currency)
      const d = col.format === 'relative_date' ? new Date(String(raw)) : null
      shown =
        d && !Number.isNaN(d.getTime()) ? (
          <time dateTime={d.toISOString()} title={new Intl.DateTimeFormat(ctx.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(d)}>
            {text}
          </time>
        ) : (
          text
        )
    } else shown = cell(raw as Scalar | undefined)
  }
  if (variant === 'text' || empty) return shown
  const tone = toTone(col.tones && Object.hasOwn(col.tones, String(raw)) ? col.tones[String(raw)] : undefined)
  const icon = <CellIcon col={col} raw={raw} ctx={ctx} />
  if (variant === 'badge') {
    return (
      <Badge variant={BADGE_VARIANT[tone]} className='gap-1'>
        {icon}
        {shown}
      </Badge>
    )
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5', tone !== 'default' && TEXT_TONE[tone])}>
      {icon}
      {shown}
    </span>
  )
}

const isChip = (c: UIColumn) => c.variant === 'badge' || c.variant === 'icon_text'
const FOCUS = 'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

/**
 * Bloque `table`. Ancho: tabla (con cabecera fija si hay `max_height`).
 * Estrecho: tarjetas con pares etiqueta/valor, o filas compactas de una o dos
 * lineas con `density: "compact"` (primera columna = titulo, resto = metadatos,
 * insignias/iconos a la derecha). Con `max_height` el cuerpo hace scroll interno,
 * alcanzable por teclado.
 */
export function TableView({ block, rows: sourceRows, text = plainText, locale, currency, resolveIcon }: TableViewProps) {
  const ctx = useMemo<Ctx>(() => ({ text, locale, currency, resolveIcon }), [text, locale, currency, resolveIcon])
  const rows = (block.rows ?? sourceRows ?? []) as Array<Record<string, unknown>>
  const cols = block.columns
  const compact = block.density === 'compact'
  const maxHeight = block.max_height && Object.hasOwn(TABLE_MAX_HEIGHT, block.max_height) ? TABLE_MAX_HEIGHT[block.max_height] : undefined
  const title = block.title ? text(block.title) : ''
  const caption = block.caption ? text(block.caption) : ''
  const name = title || caption || undefined
  const a11y = { tabIndex: 0, 'aria-label': name, style: maxHeight ? { maxHeight } : undefined }
  const [first, ...rest] = cols
  return (
    <div className='w-full' data-genui-table=''>
      {title ? <p className='mb-1 text-xs font-medium text-muted-foreground'>{title}</p> : null}
      <div {...a11y} role={name ? 'region' : undefined} data-genui-table-scroll='table' className={cn('hidden overflow-auto rounded-lg border @md:block', FOCUS)}>
        <Table noWrapper>
          {caption ? <TableCaption>{caption}</TableCaption> : null}
          <TableHeader>
            <TableRow className='motion-reduce:transition-none'>
              {cols.map((c) => (
                <TableHead key={c.key} className={cn(compact && 'h-8', maxHeight && 'sticky top-0 z-10 bg-background shadow-[inset_0_-1px_0_var(--border)]')}>
                  {text(c.label)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i} className='motion-reduce:transition-none'>
                {cols.map((c) => (
                  <TableCell key={c.key} className={cn('whitespace-normal', compact && 'py-1')}>
                    <CellValue col={c} raw={r[c.key]} ctx={ctx} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul
        {...a11y}
        role='list'
        data-genui-table-scroll='list'
        data-density={compact ? 'compact' : 'comfortable'}
        className={cn('m-0 flex list-none flex-col p-0 @md:hidden', compact ? 'divide-y rounded-lg border' : 'gap-2', maxHeight && 'overflow-y-auto', FOCUS)}
      >
        {rows.map((r, i) =>
          compact && first ? (
            <li key={i} className='flex items-start justify-between gap-2 px-2.5 py-1.5'>
              <div className='min-w-0'>
                <p className='m-0 break-words text-sm font-medium'>
                  <CellValue col={first} raw={r[first.key]} ctx={ctx} />
                </p>
                <dl className='m-0 flex flex-wrap gap-x-3 text-xs text-muted-foreground'>
                  {rest.filter((c) => !isChip(c)).map((c) => (
                    <div key={c.key}>
                      <dt className='sr-only'>{text(c.label)}</dt>
                      <dd className='m-0' title={text(c.label)}>
                        <CellValue col={c} raw={r[c.key]} ctx={ctx} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <dl className='m-0 flex shrink-0 flex-wrap justify-end gap-1'>
                {rest.filter(isChip).map((c) => (
                  <div key={c.key}>
                    <dt className='sr-only'>{text(c.label)}</dt>
                    <dd className='m-0'>
                      <CellValue col={c} raw={r[c.key]} ctx={ctx} />
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ) : (
            <li key={i} className='rounded-lg border bg-card p-2.5'>
              <dl className='m-0 grid grid-cols-1 gap-x-4 gap-y-1 text-sm @sm:grid-cols-[minmax(6rem,auto)_1fr] @sm:gap-y-1.5'>
                {cols.map((c) => (
                  <div key={c.key} className='contents'>
                    <dt className='text-xs text-muted-foreground @sm:text-sm'>{text(c.label)}</dt>
                    <dd className='m-0 whitespace-pre-line break-words text-foreground'>
                      <CellValue col={c} raw={r[c.key]} ctx={ctx} />
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ),
        )}
      </ul>
    </div>
  )
}
