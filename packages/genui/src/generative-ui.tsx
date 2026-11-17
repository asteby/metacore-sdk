import { useId, useMemo, useState, type ReactNode } from 'react'
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, ExternalLink } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Switch,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  cn,
} from '@asteby/metacore-ui'
import type {
  CardBlock,
  ChartBlock,
  ConfirmBlock,
  KPIBlock,
  LinksBlock,
  Scalar,
  TableBlock,
  TextBlock,
  TimelineBlock,
  Tone,
  UIActionHandler,
  UIBadge,
  UIBlock,
  UIField,
  UISpec,
} from './types'
import { isSafeLink, parseUISpec } from './validate'

export interface GenerativeUIProps {
  /** Untrusted spec (validated here before anything is drawn). */
  spec: unknown
  /** Called with a declared action; the host maps the id to a real call. */
  onAction?: UIActionHandler
  /** Opens an app-relative link ('/m/…') with the host router. */
  onNavigate?: (path: string) => void
  /** Disables actions while the host processes one. */
  busy?: boolean
  /** Rendered when the spec is invalid (default: nothing). */
  fallback?: ReactNode
  className?: string
}

export const BADGE_VARIANT: Record<Tone, 'muted' | 'info' | 'success' | 'warning' | 'danger' | 'secondary'> = {
  default: 'secondary',
  muted: 'muted',
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
}

export const TEXT_TONE: Record<Tone, string> = {
  default: 'text-foreground',
  muted: 'text-muted-foreground',
  info: 'text-[var(--info,oklch(0.55_0.13_235))]',
  success: 'text-[var(--success,oklch(0.6_0.15_155))]',
  warning: 'text-[var(--warning,oklch(0.6_0.15_65))]',
  danger: 'text-destructive',
}

/**
 * Renders a genui/v1 spec with the SDK's own components. Text is always
 * rendered as text (React escapes it): there is no HTML, markdown-to-HTML or
 * script path. Links are limited to http(s) and app-relative paths.
 */
export function GenerativeUI({ spec, onAction, onNavigate, busy, fallback = null, className }: GenerativeUIProps) {
  const parsed = useMemo(() => parseUISpec(spec), [spec])
  if (!parsed.ok) return <>{fallback}</>
  const s: UISpec = parsed.spec
  return (
    <section className={cn('@container flex w-full flex-col gap-2', className)} aria-label={s.title || undefined} data-genui=''>
      {s.title ? <h3 className='m-0 text-sm font-semibold text-foreground'>{s.title}</h3> : null}
      {s.blocks.map((b, i) => (
        <Block key={i} block={b} onAction={onAction} onNavigate={onNavigate} busy={busy} />
      ))}
    </section>
  )
}

interface BlockProps {
  block: UIBlock
  onAction?: UIActionHandler
  onNavigate?: (path: string) => void
  busy?: boolean
}

export function Block({ block, ...rest }: BlockProps) {
  switch (block.type) {
    case 'text':
      return <TextView block={block} />
    case 'kpi':
      return <KPIView block={block} />
    case 'card':
      return <CardView block={block} onNavigate={rest.onNavigate} />
    case 'table':
      return <TableView block={block} />
    case 'links':
      return <LinksView block={block} onNavigate={rest.onNavigate} />
    case 'timeline':
      return <TimelineView block={block} onNavigate={rest.onNavigate} />
    case 'chart':
      return <ChartView block={block} />
    case 'confirm':
      return <ConfirmView block={block} {...rest} />
  }
}

function SmartLink({ href, children, onNavigate, className }: { href: string; children: ReactNode; onNavigate?: (p: string) => void; className?: string }) {
  if (!isSafeLink(href) || !href) return <>{children}</>
  if (href.startsWith('/')) {
    return (
      <a
        href={href}
        className={className}
        onClick={(e) => {
          if (!onNavigate) return
          e.preventDefault()
          onNavigate(href)
        }}
      >
        {children}
      </a>
    )
  }
  return (
    <a href={href} target='_blank' rel='noopener noreferrer nofollow' className={className}>
      {children}
      <ExternalLink className='ml-1 inline size-3 align-baseline' aria-hidden />
      <span className='sr-only'> (se abre en otra pestaña)</span>
    </a>
  )
}

function Badges({ badges }: { badges?: UIBadge[] }) {
  if (!badges?.length) return null
  return (
    <span className='flex flex-wrap gap-1'>
      {badges.map((b, i) => (
        <Badge key={i} variant={BADGE_VARIANT[b.tone || 'default']}>
          {b.label}
        </Badge>
      ))}
    </span>
  )
}

function Fields({ fields }: { fields?: UIField[] }) {
  if (!fields?.length) return null
  return (
    <dl className='m-0 grid grid-cols-1 gap-x-4 gap-y-1 text-sm @sm:grid-cols-[minmax(6rem,auto)_1fr] @sm:gap-y-1.5'>
      {fields.map((f, i) => (
        <div key={i} className='contents'>
          <dt className='text-xs text-muted-foreground @sm:text-sm'>{f.label}</dt>
          <dd className='m-0 whitespace-pre-line break-words text-foreground'>{f.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function TextView({ block }: { block: TextBlock }) {
  return <p className={cn('m-0 whitespace-pre-line break-words text-sm', TEXT_TONE[block.tone || 'default'])}>{block.text}</p>
}

const TREND_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight }
const TREND_LABEL = { up: 'al alza', down: 'a la baja', flat: 'estable' }

function KPIView({ block }: { block: KPIBlock }) {
  return (
    <div className='w-full'>
      {block.title ? <p className='mb-1 text-xs font-medium text-muted-foreground'>{block.title}</p> : null}
      <ul className='m-0 grid list-none grid-cols-2 gap-2 p-0 @md:grid-cols-3'>
        {block.items.map((it, i) => {
          const Icon = it.trend ? TREND_ICON[it.trend] : null
          return (
            <li key={i} className='rounded-lg border bg-card p-2.5'>
              <p className='m-0 text-xs text-muted-foreground'>{it.label}</p>
              <p className={cn('m-0 flex items-center gap-1 text-lg font-semibold tabular-nums', TEXT_TONE[it.tone || 'default'])}>
                {it.value}
                {Icon && it.trend ? (
                  <>
                    <Icon className='size-4' aria-hidden />
                    <span className='sr-only'>{TREND_LABEL[it.trend]}</span>
                  </>
                ) : null}
              </p>
              {it.hint ? <p className='m-0 text-xs text-muted-foreground'>{it.hint}</p> : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function CardView({ block, onNavigate }: { block: CardBlock; onNavigate?: (p: string) => void }) {
  return (
    <Card className='w-full gap-3 py-4'>
      <CardHeader className='px-4'>
        <CardTitle className='flex flex-wrap items-center gap-2 text-sm'>
          {block.link ? (
            <SmartLink href={block.link} onNavigate={onNavigate} className='hover:underline'>
              {block.title}
            </SmartLink>
          ) : (
            block.title
          )}
          <Badges badges={block.badges} />
        </CardTitle>
        {block.subtitle ? <CardDescription>{block.subtitle}</CardDescription> : null}
      </CardHeader>
      {block.body || block.fields?.length ? (
        <CardContent className='flex flex-col gap-2 px-4'>
          {block.body ? <p className='m-0 whitespace-pre-line text-sm'>{block.body}</p> : null}
          <Fields fields={block.fields} />
        </CardContent>
      ) : null}
    </Card>
  )
}

const cell = (v: Scalar | undefined) => (v === null || v === undefined ? '—' : typeof v === 'boolean' ? (v ? 'Sí' : 'No') : String(v))

function TableView({ block }: { block: TableBlock }) {
  const rows = block.rows ?? []
  return (
    <div className='w-full'>
      {block.title ? <p className='mb-1 text-xs font-medium text-muted-foreground'>{block.title}</p> : null}
      {/* Desktop: table. Mobile: one card per row. */}
      <div className='hidden overflow-x-auto rounded-lg border @md:block'>
        <Table>
          {block.caption ? <TableCaption>{block.caption}</TableCaption> : null}
          <TableHeader>
            <TableRow>
              {block.columns.map((c) => (
                <TableHead key={c.key}>{c.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                {block.columns.map((c) => (
                  <TableCell key={c.key} className='whitespace-normal'>
                    {cell(r[c.key])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className='m-0 flex list-none flex-col gap-2 p-0 @md:hidden'>
        {rows.map((r, i) => (
          <li key={i} className='rounded-lg border bg-card p-2.5'>
            <Fields fields={block.columns.map((c) => ({ label: c.label, value: cell(r[c.key]) }))} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function LinksView({ block, onNavigate }: { block: LinksBlock; onNavigate?: (p: string) => void }) {
  return (
    <div className='w-full'>
      {block.title ? <p className='mb-1 text-xs font-medium text-muted-foreground'>{block.title}</p> : null}
      <ul className='m-0 flex list-none flex-col divide-y rounded-lg border bg-card p-0'>
        {block.items.map((it, i) => (
          <li key={i} className='flex flex-col gap-0.5 px-3 py-2'>
            {it.url ? (
              <SmartLink href={it.url} onNavigate={onNavigate} className='text-sm font-medium text-primary hover:underline'>
                {it.title}
              </SmartLink>
            ) : (
              <span className='text-sm font-medium'>{it.title}</span>
            )}
            {it.source || it.date ? (
              <span className='text-xs text-muted-foreground'>{[it.source, it.date].filter(Boolean).join(' · ')}</span>
            ) : null}
            {it.description ? <span className='text-xs text-muted-foreground'>{it.description}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

const DOT: Record<string, string> = {
  completed: 'bg-[var(--success,oklch(0.6_0.15_155))]',
  skipped: 'bg-muted-foreground',
  failed: 'bg-destructive',
  running: 'bg-[var(--info,oklch(0.62_0.13_235))]',
}

function TimelineView({ block, onNavigate }: { block: TimelineBlock; onNavigate?: (p: string) => void }) {
  return (
    <div className='w-full'>
      {block.title ? <p className='mb-1 text-xs font-medium text-muted-foreground'>{block.title}</p> : null}
      <ol className='m-0 flex list-none flex-col gap-3 border-l pl-4'>
        {block.items.map((it, i) => (
          <li key={i} className='relative'>
            <span className={cn('absolute -left-[1.3rem] top-1.5 size-2.5 rounded-full ring-2 ring-background', DOT[it.status || ''] || 'bg-primary')} aria-hidden />
            <p className='m-0 text-sm font-medium'>
              {it.url ? (
                <SmartLink href={it.url} onNavigate={onNavigate} className='hover:underline'>
                  {it.title}
                </SmartLink>
              ) : (
                it.title
              )}
              {it.status ? <span className='sr-only'> ({it.status})</span> : null}
            </p>
            {it.time ? <p className='m-0 text-xs text-muted-foreground'>{it.time}</p> : null}
            {it.description ? <p className='m-0 text-xs text-muted-foreground'>{it.description}</p> : null}
          </li>
        ))}
      </ol>
    </div>
  )
}

const SERIES_COLORS = ['var(--chart-1, #102E6B)', 'var(--chart-2, #5D646C)', 'var(--chart-3, #313D4C)', 'var(--chart-4, #051C35)']

/** Small dependency-free SVG chart with a mandatory text summary. */
function ChartView({ block }: { block: ChartBlock }) {
  const rows = block.rows ?? []
  const W = 320
  const H = 140
  const pad = 20
  const nums = rows.flatMap((r) => block.series.map((s) => Number(r[s.key]) || 0))
  const max = Math.max(1, ...nums)
  const n = Math.max(1, rows.length)
  const slot = (W - pad * 2) / n
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2)
  return (
    <figure className='m-0 w-full rounded-lg border bg-card p-3'>
      {block.title ? <figcaption className='mb-1 text-xs font-medium text-muted-foreground'>{block.title}</figcaption> : null}
      <svg viewBox={`0 0 ${W} ${H}`} className='h-auto w-full' role='img' aria-label={block.summary}>
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke='currentColor' strokeOpacity={0.2} />
        {block.kind === 'bar'
          ? rows.map((r, i) =>
              block.series.map((s, j) => {
                const bw = (slot * 0.7) / block.series.length
                const v = Number(r[s.key]) || 0
                return (
                  <rect key={`${i}-${j}`} x={pad + i * slot + slot * 0.15 + j * bw} y={y(v)} width={Math.max(1, bw - 1)} height={H - pad - y(v)} fill={SERIES_COLORS[j % 4]} rx={2} />
                )
              }),
            )
          : block.series.map((s, j) => (
              <polyline
                key={s.key}
                fill='none'
                stroke={SERIES_COLORS[j % 4]}
                strokeWidth={2}
                points={rows.map((r, i) => `${pad + i * slot + slot / 2},${y(Number(r[s.key]) || 0)}`).join(' ')}
              />
            ))}
        {rows.map((r, i) => (
          <text key={i} x={pad + i * slot + slot / 2} y={H - 6} textAnchor='middle' fontSize={9} fill='currentColor' fillOpacity={0.6}>
            {cell(r[block.x])}
          </text>
        ))}
      </svg>
      <p className='m-0 mt-1 text-xs text-muted-foreground'>{block.summary}</p>
      {block.series.length > 1 ? (
        <ul className='m-0 mt-1 flex list-none flex-wrap gap-3 p-0 text-xs'>
          {block.series.map((s, j) => (
            <li key={s.key} className='flex items-center gap-1'>
              <span className='inline-block size-2.5 rounded-sm' style={{ background: SERIES_COLORS[j % 4] }} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
    </figure>
  )
}

const BUTTON_VARIANT = { primary: 'default', secondary: 'secondary', ghost: 'ghost', danger: 'destructive' } as const

function ConfirmView({ block, onAction, onNavigate, busy }: BlockProps & { block: ConfirmBlock }) {
  const baseId = useId()
  const [values, setValues] = useState<Record<string, Scalar>>(() =>
    Object.fromEntries((block.inputs ?? []).map((i) => [i.name, i.value ?? (i.kind === 'switch' ? false : '')])),
  )
  const [pending, setPending] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const missing = (block.inputs ?? []).some((i) => i.required && (values[i.name] === '' || values[i.name] === null))
  const run = async (id: string, params: Record<string, Scalar> = {}) => {
    if (!onAction) return
    setPending(id)
    try {
      await onAction({ id, params, values })
      setDone(id)
    } catch {
      // The host already reported the failure; keep the actions available.
    } finally {
      setPending(null)
    }
  }
  void onNavigate
  return (
    <Card className='w-full gap-3 border-primary/30 py-4' role='group' aria-labelledby={`${baseId}-t`}>
      <CardHeader className='px-4'>
        <CardTitle id={`${baseId}-t`} className='flex flex-wrap items-center gap-2 text-sm'>
          {block.title}
          <Badges badges={block.badges} />
        </CardTitle>
        {block.description ? <CardDescription className='whitespace-pre-line'>{block.description}</CardDescription> : null}
      </CardHeader>
      {block.fields?.length || block.inputs?.length ? (
        <CardContent className='flex flex-col gap-3 px-4'>
          <Fields fields={block.fields} />
          {(block.inputs ?? []).map((inp) => {
            const id = `${baseId}-${inp.name}`
            const v = values[inp.name]
            const set = (nv: Scalar) => setValues((p) => ({ ...p, [inp.name]: nv }))
            return (
              <div key={inp.name} className='flex flex-col gap-1'>
                <Label htmlFor={id}>
                  {inp.label}
                  {inp.required ? <span aria-hidden> *</span> : null}
                </Label>
                {inp.kind === 'textarea' ? (
                  <Textarea id={id} value={String(v ?? '')} onChange={(e) => set(e.target.value)} required={inp.required} />
                ) : inp.kind === 'switch' ? (
                  <Switch id={id} checked={Boolean(v)} onCheckedChange={(c) => set(c)} />
                ) : inp.kind === 'select' ? (
                  <select
                    id={id}
                    className='h-9 rounded-md border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
                    value={String(v ?? '')}
                    onChange={(e) => set(e.target.value)}
                    required={inp.required}
                  >
                    {(inp.options ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id={id}
                    type={inp.kind === 'number' ? 'number' : inp.kind === 'time' ? 'time' : inp.kind === 'date' ? 'date' : 'text'}
                    value={String(v ?? '')}
                    onChange={(e) => set(inp.kind === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)}
                    required={inp.required}
                  />
                )}
                {inp.help ? <p className='m-0 text-xs text-muted-foreground'>{inp.help}</p> : null}
              </div>
            )
          })}
        </CardContent>
      ) : null}
      <CardFooter className='flex flex-wrap gap-2 px-4'>
        {done ? (
          <p role='status' className='m-0 flex items-center gap-1.5 text-sm font-medium text-[var(--success,oklch(0.6_0.15_155))]'>
            <Check className='size-4' aria-hidden />
            {block.actions.find((a) => a.id === done)?.label}
          </p>
        ) : null}
        {!done && block.actions.map((a) => (
          <Button
            key={a.id}
            type='button'
            size='sm'
            variant={BUTTON_VARIANT[a.variant || 'secondary']}
            disabled={busy || pending !== null || !onAction || (a.variant === 'primary' && missing)}
            aria-busy={pending === a.id}
            onClick={() => void run(a.id, a.params)}
          >
            {pending === a.id ? '…' : a.label}
          </Button>
        ))}
      </CardFooter>
    </Card>
  )
}
