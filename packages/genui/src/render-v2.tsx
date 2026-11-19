import { useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, ChevronDown, Info } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@asteby/metacore-ui'
import { BADGE_VARIANT, Block as V1Block, TEXT_TONE } from './generative-ui'
import { parseGenUI } from './compat'
import type { ParseV2Options } from './validate-v2'
import { DiagramBlock } from './diagram'
import { MetricBlock } from './metric'
import { renderMarkdown } from './markdown'
import { mapLegend, normalizeMapPoints } from './map-points'
import { getGenUIBlockRenderer, useGenUI, type GenUIActionRequest, type GenUIBlock, type GenUIBlockRendererProps } from './registry'
import type { Tone } from './types'

type Act = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const GRID_COLS = ['', 'grid-cols-1', 'grid-cols-1 @md:grid-cols-2', 'grid-cols-1 @md:grid-cols-2 @2xl:grid-cols-3', 'grid-cols-1 @md:grid-cols-2 @2xl:grid-cols-4']
const BTN = { primary: 'default', secondary: 'secondary', ghost: 'ghost', danger: 'destructive' } as const

export interface GenUIProps {
  /** Untrusted spec, genui/v1 or genui/v2 (validated here before anything is drawn). */
  spec: unknown
  /** Rendered when the spec is invalid (default: nothing). */
  fallback?: ReactNode
  className?: string
  /** Overrides the provider's `allowExternalLinks` for this tree. */
  allowExternalLinks?: boolean
}

/**
 * genui/v2 renderer. Validates with `parseGenUI` (v1 is upgraded), then draws
 * the closed block set from registered renderers: built-ins here (composition,
 * text, markdown, alert, empty, card, list, metric, diagram, and the v1 blocks)
 * and external ones registered with `registerGenUIBlockRenderer` (map, chart…).
 * A block with no renderer shows its `fallback` text. Phase 1 does not evaluate
 * `when`, `$ref` or declared sources: a block with `when` is not shown (it must
 * never appear without its condition) and sources come from `GenUIProvider`.
 */
export function GenUI({ spec, fallback = null, className, allowExternalLinks }: GenUIProps) {
  const ctx = useGenUI()
  const allow = allowExternalLinks ?? ctx.allowExternalLinks ?? false
  const opts: ParseV2Options = { allowExternalLinks: allow }
  const parsed = useMemo(() => parseGenUI(spec, opts), [spec, allow]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!parsed.ok) return <>{fallback}</>
  const doc = parsed.spec as unknown as { title?: unknown; data?: Record<string, unknown>; blocks: GenUIBlock[] }
  return <Tree doc={doc} className={className} allow={allow} />
}

function Tree({ doc, className, allow }: { doc: { title?: unknown; blocks: GenUIBlock[] }; className?: string; allow: boolean }) {
  const ctx = useGenUI()
  const text = (v: unknown): string => {
    if (typeof v === 'string') return v
    if (v && typeof v === 'object' && '$t' in v) {
      const o = v as { $t: string; args?: Record<string, unknown> }
      return ctx.t ? ctx.t(o.$t, o.args) : o.$t
    }
    return ''
  }
  const navigate = (p: string) => (ctx.onNavigate ? ctx.onNavigate(p) : void (window.location.href = p))
  const act = (req: GenUIActionRequest) => ctx.onAction?.(req)
  const renderBlocks = (blocks: GenUIBlock[]): ReactNode =>
    blocks.map((b, i) => <BlockHost key={b.id ?? i} block={b} renderBlocks={renderBlocks} text={text} navigate={navigate} act={act} allowExternalLinks={allow} />)
  return (
    <section className={cn('@container flex w-full flex-col gap-2', className)} aria-label={doc.title ? text(doc.title) : undefined} data-genui='v2'>
      {doc.title ? <h3 className='m-0 text-sm font-semibold text-foreground'>{text(doc.title)}</h3> : null}
      {renderBlocks(doc.blocks)}
    </section>
  )
}

type HostProps = Omit<GenUIBlockRendererProps, 'block' | 'rows' | 'locale' | 'currency'> & { block: GenUIBlock }

function BlockHost({ block, ...rest }: HostProps) {
  const ctx = useGenUI()
  // A condition the phase-1 renderer cannot evaluate: never show the block without it.
  if (block.when) return null
  const source = typeof block.source === 'string' ? block.source.slice(5) : undefined
  const rows = source !== undefined && ctx.sources && Object.hasOwn(ctx.sources, source) ? ctx.sources[source] : undefined
  const props: GenUIBlockRendererProps = { ...rest, block, rows, locale: ctx.locale, currency: ctx.currency }
  const own = ctx.renderers && Object.hasOwn(ctx.renderers, block.type) ? ctx.renderers[block.type] : undefined
  const Custom = own ?? getGenUIBlockRenderer(block.type)
  if (Custom) return <Custom {...props} />
  const Builtin = BUILTIN[block.type]
  if (Builtin) return <Builtin {...props} />
  return block.fallback ? <p className='m-0 text-sm text-muted-foreground'>{block.fallback}</p> : null
}

// ---- composition ----

function Stack({ block, renderBlocks, text }: GenUIBlockRendererProps) {
  return (
    <div className={cn('flex gap-2', block.direction === 'horizontal' ? 'flex-col @md:flex-row @md:flex-wrap' : 'flex-col')}>
      {block.title ? <h4 className='m-0 w-full text-xs font-medium text-muted-foreground'>{text(block.title)}</h4> : null}
      {renderBlocks(block.blocks)}
    </div>
  )
}

function Grid({ block, renderBlocks, text }: GenUIBlockRendererProps) {
  const cols = Math.min(4, Math.max(1, Number(block.columns) || 2))
  return (
    <div>
      {block.title ? <h4 className='m-0 mb-1 text-xs font-medium text-muted-foreground'>{text(block.title)}</h4> : null}
      <div className={cn('grid gap-2', GRID_COLS[cols])}>{renderBlocks(block.blocks)}</div>
    </div>
  )
}

function Tabbed({ block, renderBlocks, text }: GenUIBlockRendererProps) {
  const tabs = block.tabs as Array<{ key: string; label: unknown; blocks: GenUIBlock[] }>
  const [value, setValue] = useState(tabs[0]!.key)
  return (
    <Tabs value={value} onValueChange={setValue}>
      <TabsList className='h-auto flex-wrap'>
        {tabs.map((t) => (
          <TabsTrigger key={t.key} value={t.key}>
            {text(t.label)}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.key} value={t.key} className='flex flex-col gap-2'>
          {t.key === value ? renderBlocks(t.blocks) : null}
        </TabsContent>
      ))}
    </Tabs>
  )
}

function Section({ block, renderBlocks, text }: GenUIBlockRendererProps) {
  const [open, setOpen] = useState(!block.collapsed)
  const collapsible = !!block.collapsible
  return (
    <section className='flex flex-col gap-2'>
      {collapsible ? (
        <button type='button' className='flex w-full items-center gap-1 text-left text-sm font-semibold' aria-expanded={open} onClick={() => setOpen(!open)}>
          <ChevronDown className={cn('size-4 transition-transform', !open && '-rotate-90')} aria-hidden />
          {text(block.title)}
        </button>
      ) : (
        <h4 className='m-0 text-sm font-semibold'>{text(block.title)}</h4>
      )}
      {open ? renderBlocks(block.blocks) : null}
    </section>
  )
}

// ---- content ----

function Text({ block, text }: GenUIBlockRendererProps) {
  return <p className={cn('m-0 whitespace-pre-line break-words text-sm', TEXT_TONE[(block.tone as Tone) || 'default'])}>{text(block.text)}</p>
}

function Markdown({ block, navigate, allowExternalLinks }: GenUIBlockRendererProps) {
  return <div className='flex flex-col gap-2'>{renderMarkdown(block.markdown, { allowExternalLinks, onNavigate: navigate })}</div>
}

function AlertBlock({ block, text }: GenUIBlockRendererProps) {
  const danger = block.tone === 'danger'
  const Icon = block.tone === 'warning' || danger ? AlertTriangle : Info
  return (
    <Alert variant={danger ? 'destructive' : 'default'} className={cn(!danger && block.tone && block.tone !== 'default' && TEXT_TONE[block.tone as Tone])}>
      <Icon className='size-4' aria-hidden />
      {block.title ? <AlertTitle>{text(block.title)}</AlertTitle> : null}
      <AlertDescription>{text(block.text)}</AlertDescription>
    </Alert>
  )
}

function Actions({ actions, text, navigate, act, blockId, context }: { actions?: Act[]; text: (v: unknown) => string; navigate: (p: string) => void; act: (r: GenUIActionRequest) => void; blockId?: string; context?: Record<string, unknown> }) {
  if (!actions?.length) return null
  return (
    <div className='flex flex-wrap gap-2'>
      {actions.filter((a) => !a.when).map((a, i) => (
        <Button key={i} size='sm' variant={BTN[(a.variant as keyof typeof BTN) ?? 'secondary'] ?? 'secondary'} onClick={() => run(a, { navigate, act, blockId, context })}>
          {text(a.label) || a.do}
        </Button>
      ))}
    </div>
  )
}

/** Plain app navigation runs here; anything else (or anything that asks for confirmation) is the host's. */
function run(a: Act, o: { navigate: (p: string) => void; act: (r: GenUIActionRequest) => void; blockId?: string; context?: Record<string, unknown> }) {
  if (a.do === 'navigate' && typeof a.route?.path === 'string' && !a.confirm) return o.navigate(a.route.path)
  o.act({ action: a, blockId: o.blockId, context: o.context })
}

function Empty({ block, text, navigate, act }: GenUIBlockRendererProps) {
  return (
    <div className='flex flex-col items-center gap-1 rounded-lg border border-dashed p-6 text-center'>
      <p className='m-0 text-sm font-medium'>{text(block.title)}</p>
      {block.text ? <p className='m-0 text-sm text-muted-foreground'>{text(block.text)}</p> : null}
      <Actions actions={block.actions} text={text} navigate={navigate} act={act} blockId={block.id} />
    </div>
  )
}

function CardBlock({ block, text, navigate, act, allowExternalLinks }: GenUIBlockRendererProps) {
  const link = typeof block.link === 'string' && (block.link.startsWith('/') || allowExternalLinks) ? block.link : undefined
  return (
    <Card className={cn(block.tone && block.tone !== 'default' && 'border-l-4')}>
      <CardHeader>
        <CardTitle className='flex flex-wrap items-center gap-2 text-sm'>
          {link ? (
            <a href={link} className='underline-offset-2 hover:underline' {...(link.startsWith('/') ? { onClick: (e: React.MouseEvent) => { e.preventDefault(); navigate(link) } } : { target: '_blank', rel: 'noopener noreferrer nofollow' })}>
              {text(block.title)}
            </a>
          ) : (
            text(block.title)
          )}
          {(block.badges ?? []).map((b: { label: string; tone?: Tone }, i: number) => (
            <Badge key={i} variant={BADGE_VARIANT[b.tone || 'default']}>{b.label}</Badge>
          ))}
        </CardTitle>
        {block.subtitle ? <CardDescription>{text(block.subtitle)}</CardDescription> : null}
      </CardHeader>
      {block.body || block.fields?.length ? (
        <CardContent className='flex flex-col gap-2 text-sm'>
          {block.body ? <p className='m-0 whitespace-pre-line'>{text(block.body)}</p> : null}
          {block.fields?.length ? (
            <dl className='m-0 grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-4 gap-y-1'>
              {block.fields.map((f: { label: unknown; value?: unknown }, i: number) => (
                <div key={i} className='contents'>
                  <dt className='text-muted-foreground'>{text(f.label)}</dt>
                  <dd className='m-0 break-words'>{text(f.value)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </CardContent>
      ) : null}
      {block.actions?.length ? (
        <CardFooter>
          <Actions actions={block.actions} text={text} navigate={navigate} act={act} blockId={block.id} />
        </CardFooter>
      ) : null}
    </Card>
  )
}

function ListBlock({ block, text, navigate, act }: GenUIBlockRendererProps) {
  return (
    <div>
      {block.title ? <p className='m-0 mb-1 text-xs font-medium text-muted-foreground'>{text(block.title)}</p> : null}
      <ul className='m-0 flex list-none flex-col divide-y rounded-lg border p-0'>
        {block.items.map((it: { title: unknown; description?: unknown; badge?: { label: string; tone?: Tone }; action?: Act }, i: number) => (
          <li key={i} className='flex items-center justify-between gap-3 p-2.5'>
            <div className='min-w-0'>
              <p className='m-0 flex items-center gap-2 text-sm font-medium'>
                {text(it.title)}
                {it.badge ? <Badge variant={BADGE_VARIANT[it.badge.tone || 'default']}>{it.badge.label}</Badge> : null}
              </p>
              {it.description ? <p className='m-0 text-xs text-muted-foreground'>{text(it.description)}</p> : null}
            </div>
            {it.action ? <Actions actions={[it.action]} text={text} navigate={navigate} act={act} blockId={block.id} context={{ item: i }} /> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** `stats` is `kpi` with extras: same view over its inline items (sources arrive with the host's rows). */
function Stats({ block, rows, text, ...rest }: GenUIBlockRendererProps) {
  const items = (block.items ?? (rows ?? []).slice(0, 12).map((r) => ({ label: String(r.label ?? ''), value: String(r.value ?? '') }))) as Array<Record<string, unknown>>
  const resolved = items.map((it) => ({ ...it, label: text(it.label), value: text(it.value), hint: it.hint === undefined ? undefined : text(it.hint) }))
  return <V1Block block={{ type: 'kpi', title: block.title ? text(block.title) : undefined, items: resolved } as never} onNavigate={rest.navigate} />
}

/**
 * v1-shaped blocks keep their v1 view. v2-only fields (`id`, `when`, `fallback`)
 * are dropped and `$t` text is resolved first, so the v1 view sees plain strings.
 */
function V1Passthrough({ block, rows, text, navigate }: GenUIBlockRendererProps) {
  const plain = useMemo(() => resolveText(block, text), [block, text])
  const { id: _id, when: _w, fallback: _f, source: _s, ...rest } = plain as GenUIBlock
  void _id; void _w; void _f; void _s
  // `source`: the host's rows feed the v1 view (chart/table/...) unless the block carries inline rows.
  const withRows = rows && rest.rows === undefined ? { ...rest, rows } : rest
  return <V1Block block={withRows as never} onNavigate={navigate} />
}

const TEXT_KEYS = new Set(['title', 'text', 'label', 'subtitle', 'body', 'description', 'hint', 'caption', 'value'])
function resolveText(v: unknown, text: (x: unknown) => string, key = ''): unknown {
  if (Array.isArray(v)) return v.map((x) => resolveText(x, text, key))
  if (v && typeof v === 'object') {
    if ((('$t' in v) || ('$ref' in v)) && TEXT_KEYS.has(key)) return text(v)
    if (key === 'rows') return v
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveText(x, text, k)]))
  }
  return v
}

/**
 * Accessible stand-in for `map` when no renderer is registered (register
 * `@asteby/metacore-maps/genui` to get the real map): the points as a list
 * with their status written out and the legend.
 */
function MapFallback({ block, rows, text }: GenUIBlockRendererProps) {
  const points = normalizeMapPoints(block, rows, text)
  const legend = mapLegend(points, block.group_by === 'group' ? 'group' : 'status')
  return (
    <section aria-label={block.summary} className='rounded-lg border p-2.5' data-genui-block='map-fallback'>
      {block.title ? <p className='m-0 mb-1 text-xs font-medium text-muted-foreground'>{text(block.title)}</p> : null}
      {legend.length > 1 ? (
        <ul className='m-0 mb-2 flex list-none flex-wrap gap-1 p-0'>
          {legend.map((l) => (
            <li key={l.value}><Badge variant={BADGE_VARIANT[l.tone ?? 'default']}>{l.value} · {l.count}</Badge></li>
          ))}
        </ul>
      ) : null}
      <ul className='m-0 list-none p-0 text-sm'>
        {points.map((p) => (
          <li key={p.key} className='flex justify-between gap-2 py-0.5'>
            <span>{p.label}</span>
            <span className='text-muted-foreground'>{[p.status, `${p.lat.toFixed(3)}, ${p.lng.toFixed(3)}`].filter(Boolean).join(' · ')}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

const BUILTIN: Record<string, (p: GenUIBlockRendererProps) => ReactNode> = {
  stack: Stack, grid: Grid, tabs: Tabbed, section: Section,
  text: Text, markdown: Markdown, alert: AlertBlock, empty: Empty, card: CardBlock, list: ListBlock,
  metric: MetricBlock, diagram: DiagramBlock, map: MapFallback, stats: Stats,
  kpi: V1Passthrough, links: V1Passthrough, timeline: V1Passthrough, table: V1Passthrough, chart: V1Passthrough, confirm: V1Passthrough,
}

/** The block types this build can draw by itself (before any `registerGenUIBlockRenderer`). */
export const GENUI_BUILTIN_BLOCKS: readonly string[] = Object.keys(BUILTIN)
