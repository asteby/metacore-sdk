// Renderers de pagina (page@1) para genui v2: grid con areas, stats/kpi_card,
// section (declarative | hybrid | custom), map con seleccion y el bloque `ext`.
// Contratos de page@1 que el esquema genui/v2 (compartido con el kernel) ya
// valida. Se interpretan aqui sobre definiciones tipadas (`PageBlockDef`) cuyos
// campos hoja salen de los tipos generados; los bloques del nucleo se delegan a `GenUI`.
import { Component, useId, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ErrorInfo, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, cn } from '@asteby/metacore-ui'
import { GenUI } from '../render-v2'
import { GenUIProvider, useGenUI, type GenUIActionRequest, type GenUISources } from '../registry'
import { TEXT_TONE } from '../generative-ui'
import { usePageIcon } from '../icons'
import { formatMetric } from '../metric'
import type { Tone } from '../types'
import type { Area, AreaRow, BlockGrid, BlockKpiCard, BlockSection, BlockTabs, ExtName, ExtProps, GridTrack, PermissionKey, TabIcon } from '../generated/genui-v2'
import { PageProvider, evalPredicate, getPath, isSafePath, resolveRef, usePageContext, type PageContextValue, type PageProviderProps } from './context'
import { getPageBlock, type BlockData, type BlockDefinition } from './custom'

type Obj = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/** Un bloque de pagina: cualquier bloque genui v2 mas los de pagina (`area`, `mode`, `kpi_card`...). */
export type PageBlockDef = { type: string; id?: string; area?: Area; when?: unknown; fallback?: string; [key: string]: any } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface PageGridDef extends PageBlockDef {
  type: 'grid'
  /** Filas de la plantilla: `"kpis kpis"`, `"map detail"`. Tokens `[a-z][a-z0-9_]*` o `.`. */
  areas?: AreaRow[]
  /** Pistas de columna: `auto`, `Nfr`, `Npx` (120-640), `minmax(Npx, Nfr)`. */
  columns?: number | GridTrack[]
  rows?: GridTrack[]
  /** Orden de areas en pantalla angosta, una por fila. */
  mobile?: Area[]
  blocks?: PageBlockDef[]
}

export type PageSectionMode = NonNullable<BlockSection['mode']>

export interface PageSectionDef extends PageBlockDef {
  type: 'section'
  mode?: PageSectionMode
  chrome?: BlockSection['chrome']
  title?: unknown
  permission?: PermissionKey
  on_denied?: BlockSection['on_denied']
  /** `data.<fuente>`: da los estados de carga/error/vacio de la seccion. */
  source?: string
  empty?: unknown
  /** mode=declarative|hybrid. */
  blocks?: PageBlockDef[]
  /** mode=custom: `<addon>.<nombre>@<mayor>` registrado con `registerPageBlock`. */
  component?: ExtName
  props?: ExtProps
}

export interface PageTabOption {
  key: string
  label: unknown
  /** Conjunto interno (map, cards, table, dashboard, list, calendar, chart) o cualquier nombre que resuelva el host con `resolveIcon`. */
  icon?: TabIcon | (string & {})
  /** Sin permiso efectivo la opcion no se pinta ni se monta. */
  permission?: PermissionKey
  /** Vista declarativa/hibrida: bloques de pagina. */
  blocks?: PageBlockDef[]
  /** Vista custom: `<addon>.<nombre>@<mayor>` registrado con `registerPageBlock`. */
  component?: ExtName
  props?: ExtProps
}

/** `tabs` de pagina: extiende el `tabs` del nucleo (conmutador de vistas sobre las mismas fuentes). */
export interface PageTabsDef extends PageBlockDef {
  type: 'tabs'
  /** `tabs` (por defecto) | `segmented` (control segmentado, a la derecha). */
  variant?: BlockTabs['variant']
  /** `state.<ruta>` donde vive la vista activa; sin ella el estado es local al bloque. */
  state?: string
  /** Clave de la vista inicial (si no existe o no es visible: la primera visible). */
  default?: string
  /** Conserva montadas (ocultas) las vistas ya visitadas; por defecto solo la activa. */
  keep_alive?: boolean
  chrome?: BlockTabs['chrome']
  /** Nombre accesible del control. */
  label?: unknown
  /** Pantalla angosta: `select` (por defecto) o `scroll` (tira con scroll horizontal). */
  mobile?: BlockTabs['mobile']
  tabs: PageTabOption[]
}

export interface PageKpiCardDef extends PageBlockDef {
  type: 'kpi_card'
  label: unknown
  value: unknown
  format?: BlockKpiCard['format']
  trend?: BlockKpiCard['trend']
  tone?: Tone
  hint?: unknown
  cta?: Obj
}

export interface PageMapDef extends PageBlockDef {
  type: 'map'
  summary: string
  /** `state.<ruta>` donde se escribe la clave del punto seleccionado. */
  select?: string
}

// ---- util ----

function useText() {
  const g = useGenUI()
  return (v: unknown, pc?: PageContextValue, sources?: GenUISources): string => {
    if (typeof v === 'string') return v
    if (v && typeof v === 'object') {
      if ('$t' in v) {
        const o = v as { $t: string; args?: Record<string, unknown> }
        return g.t ? g.t(o.$t, o.args) : o.$t
      }
      if ('$ref' in v && pc) {
        const r = resolveRef((v as { $ref: string }).$ref, { state: pc.state, sources: sources ?? g.sources, ctx: pc.ctx })
        return r === undefined || r === null ? '' : String(r)
      }
    }
    return typeof v === 'number' || typeof v === 'boolean' ? String(v) : ''
  }
}

function useRaw(): (v: unknown) => unknown {
  const pc = usePageContext()
  const g = useGenUI()
  return (v) => (v && typeof v === 'object' && '$ref' in v ? resolveRef((v as { $ref: string }).$ref, { state: pc.state, sources: g.sources, ctx: pc.ctx }) : v)
}

const mq = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? () => window.matchMedia('(max-width: 640px)') : null
function useNarrow(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = mq?.()
      m?.addEventListener?.('change', cb)
      return () => m?.removeEventListener?.('change', cb)
    },
    () => mq?.().matches ?? false,
    () => false,
  )
}

// ---- acciones ----

/** Ejecuta un verbo declarado: `set` (estado) y `emit` (bus) son de pagina; el resto es del host. */
export function usePageAction() {
  const pc = usePageContext()
  const g = useGenUI()
  const raw = useRaw()
  return (action: Obj, blockId?: string, context?: Record<string, unknown>) => {
    if (action.do === 'set' && typeof action.path === 'string' && action.path.startsWith('state.')) {
      const p = action.path.slice(6)
      if (isSafePath(p) && !action.confirm) return pc.setState(p, raw(action.value))
    }
    if (action.do === 'emit' && typeof action.id === 'string' && action.id.startsWith('page.') && !action.confirm) {
      return pc.emit(action.id.slice(5), action.params, blockId)
    }
    if (action.do === 'navigate' && typeof action.route?.path === 'string' && !action.confirm) {
      return g.onNavigate ? g.onNavigate(action.route.path) : void (window.location.href = action.route.path)
    }
    g.onAction?.({ action, blockId, context } satisfies GenUIActionRequest)
  }
}

// ---- ErrorBoundary por seccion ----

interface BoundaryProps { id?: string; label: string; retryLabel: string; onError?: (e: Error, i: ErrorInfo) => void; children?: ReactNode }
class SectionBoundary extends Component<BoundaryProps, { error: Error | null }> {
  override state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info)
  }
  override render() {
    if (!this.state.error) return this.props.children
    return (
      <div role='alert' data-genui-block='section-error' className='flex flex-col items-start gap-2 rounded-lg border border-destructive/40 p-3 text-sm'>
        <p className='m-0'>{this.props.label}</p>
        <Button size='sm' variant='secondary' onClick={() => this.setState({ error: null })}>
          {this.props.retryLabel}
        </Button>
      </div>
    )
  }
}

// ---- lista de bloques ----

export interface PageBlocksProps {
  blocks: PageBlockDef[]
  /** `data` declarado del documento (las fuentes que los bloques del nucleo pueden referenciar). */
  data?: Record<string, unknown>
}

/** Renderiza bloques de pagina. Los tipos desconocidos para la pagina se delegan a `GenUI`. */
export function PageBlocks({ blocks, data }: PageBlocksProps) {
  return <>{blocks.map((b, i) => <PageBlock key={b.id ?? i} block={b} data={data} />)}</>
}

function PageBlock({ block, data, allowExt = true }: { block: PageBlockDef; data?: Record<string, unknown>; allowExt?: boolean }) {
  const pc = usePageContext()
  const g = useGenUI()
  if (block.when && typeof block.when === 'object') {
    const w = block.when as { ref: string; equals?: unknown; in?: unknown[]; not_in?: unknown[]; empty?: boolean }
    if (!evalPredicate(w,resolveRef(w.ref, { state: pc.state, sources: g.sources, ctx: pc.ctx }))) return null
  }
  switch (block.type) {
    case 'grid':
      return <PageGrid block={block as PageGridDef} data={data} allowExt={allowExt} />
    case 'section':
      return <PageSection block={block as PageSectionDef} data={data} />
    case 'tabs':
      return <PageTabs block={block as PageTabsDef} data={data} />
    case 'kpi_card':
      return <KpiCard block={block as PageKpiCardDef} />
    case 'stats':
      return <PageStats block={block} data={data} />
    case 'map':
      return <PageMap block={block as PageMapDef} data={data} />
    case 'ext':
      return allowExt ? <ExtBlock block={block} /> : <Fallback block={block} />
    default:
      return <Core block={block} data={data} />
  }
}

function Fallback({ block }: { block: PageBlockDef }) {
  return block.fallback ? <p className='m-0 text-sm text-muted-foreground'>{block.fallback}</p> : null
}

/** Bloque del nucleo: se valida y pinta con `GenUI` (sin claves de pagina ni `when`, ya evaluado). */
function Core({ block, data }: { block: PageBlockDef; data?: Record<string, unknown> }) {
  const { area: _a, when: _w, ...core } = block
  void _a; void _w
  const pc = usePageContext()
  const g = useGenUI()
  const spec = useMemo(() => ({ version: 'genui/v2', ...(data ? { data } : {}), blocks: [core] }), [core, data])
  // Estado de su fuente: un bloque hoja con la fuente caida o cargando no se queda mudo ni en blanco.
  const name = typeof block.source === 'string' ? block.source.replace(/^data\./, '') : undefined
  const st = name !== undefined ? pc.sourceStatus[name] : undefined
  const loaded = name !== undefined && !!g.sources && Object.hasOwn(g.sources, name) && g.sources[name] !== undefined
  if (st?.status === 'error') {
    return (
      <div role='alert' data-genui-block='source-error' className='flex flex-col items-start gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground'>
        <p className='m-0'>{st.error || MSG.error}</p>
        {st.retry ? (
          <Button size='sm' variant='secondary' onClick={st.retry}>
            {MSG.retry}
          </Button>
        ) : null}
      </div>
    )
  }
  if (st?.status === 'loading' && !loaded && block.type !== 'metric') {
    return <div role='status' aria-busy='true' aria-label={MSG.loading} data-genui-block='source-loading' className='h-24 animate-pulse rounded-md bg-muted' />
  }
  return <GenUI spec={spec} fallback={<Fallback block={block} />} />
}

// ---- grid con areas ----

const TRACK_PX = /^(\d+)px$/
const TRACK_FR = /^\d+(\.\d+)?fr$/
const clampPx = (n: number) => Math.min(640, Math.max(120, n))

/** Pista permitida o `1fr`. Sin CSS libre: solo `auto`, `Nfr`, `Npx` y `minmax(Npx, Nfr|Npx)`. */
export function sanitizeTrack(t: unknown): string {
  if (typeof t !== 'string') return '1fr'
  const s = t.trim()
  if (s === 'auto' || TRACK_FR.test(s)) return s
  const px = TRACK_PX.exec(s)
  if (px) return `${clampPx(Number(px[1]))}px`
  const m = /^minmax\(\s*(\d+)px\s*,\s*(\d+(?:\.\d+)?fr|\d+px)\s*\)$/.exec(s)
  if (m) {
    const max = TRACK_PX.exec(m[2]!)
    return `minmax(${clampPx(Number(m[1]))}px, ${max ? `${clampPx(Number(max[1]))}px` : m[2]})`
  }
  return '1fr'
}

const AREA = /^[a-z][a-z0-9_]*$/

/** Plantilla de areas valida (filas rectangulares) o undefined. */
export function parseAreas(areas: unknown): string[][] | undefined {
  if (!Array.isArray(areas) || areas.length === 0 || areas.length > 24) return undefined
  const rows = areas.map((r) => (typeof r === 'string' ? r.trim().split(/\s+/) : []))
  const w = rows[0]?.length ?? 0
  if (w === 0 || w > 12 || rows.some((r) => r.length !== w || r.some((t) => t !== '.' && !AREA.test(t)))) return undefined
  return rows
}

const GRID_COLS = ['', 'grid-cols-1', 'grid-cols-1 @md:grid-cols-2', 'grid-cols-1 @md:grid-cols-2 @2xl:grid-cols-3', 'grid-cols-1 @md:grid-cols-2 @2xl:grid-cols-4']

function PageGrid({ block, data, allowExt }: { block: PageGridDef; data?: Record<string, unknown>; allowExt: boolean }) {
  const text = useText()
  const narrow = useNarrow()
  const children = (block.blocks ?? []) as PageBlockDef[]
  const title = block.title ? <h4 className='m-0 mb-1 text-xs font-medium text-muted-foreground'>{text(block.title)}</h4> : null
  const areas = parseAreas(block.areas)
  if (!areas) {
    const cols = Math.min(4, Math.max(1, typeof block.columns === 'number' ? block.columns : 2))
    return (
      <div>
        {title}
        <div className={cn('grid gap-2', GRID_COLS[cols])}>{children.map((b, i) => <PageBlock key={b.id ?? i} block={b} data={data} allowExt={allowExt} />)}</div>
      </div>
    )
  }
  const names = new Set(areas.flat().filter((t) => t !== '.'))
  const mobile = Array.isArray(block.mobile) ? block.mobile.filter((n: unknown): n is string => typeof n === 'string' && names.has(n)) : undefined
  const useMobile = narrow && !!mobile?.length
  const style: CSSProperties = useMobile
    ? { gridTemplateAreas: mobile!.map((n) => `"${n}"`).join(' '), gridTemplateColumns: 'minmax(0, 1fr)' }
    : {
        gridTemplateAreas: areas.map((r) => `"${r.join(' ')}"`).join(' '),
        gridTemplateColumns: Array.from({ length: areas[0]!.length }, (_, i) => (Array.isArray(block.columns) ? sanitizeTrack(block.columns[i]) : '1fr')).join(' '),
        ...(Array.isArray(block.rows) ? { gridTemplateRows: block.rows.slice(0, areas.length).map(sanitizeTrack).join(' ') } : {}),
      }
  return (
    <div data-genui-block='grid-areas'>
      {title}
      <div className='grid gap-2' style={style}>
        {children.map((b, i) => {
          const placed = typeof b.area === 'string' && names.has(b.area) && (!useMobile || mobile!.includes(b.area))
          // Hijo sin area valida: no se coloca (nunca se pinta en un lugar que el autor no declaro).
          if (!placed) return null
          return (
            <div key={b.id ?? i} data-area={b.area} className='min-w-0' style={{ gridArea: b.area }}>
              <PageBlock block={b} data={data} allowExt={allowExt} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---- stats / kpi_card ----

const TREND_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight }
const TREND_LABEL = { up: 'al alza', down: 'a la baja', flat: 'estable' }

interface TileProps {
  label: string
  value: string
  tone?: Tone
  trend?: 'up' | 'down' | 'flat'
  hint?: string
  onClick?: () => void
  cta?: { label: string; onClick: () => void }
}

function Tile({ label, value, tone = 'default', trend, hint, onClick, cta }: TileProps) {
  const Trend = trend ? TREND_ICON[trend] : null
  const body = (
    <>
      <span className='text-xs text-muted-foreground'>{label}</span>
      <span className={cn('text-2xl font-semibold tabular-nums', TEXT_TONE[tone])}>{value}</span>
      {Trend ? (
        <span className='inline-flex items-center gap-1 text-xs text-muted-foreground'>
          <Trend className='size-3' aria-hidden />
          {TREND_LABEL[trend!]}
        </span>
      ) : null}
      {hint ? <span className='text-xs text-muted-foreground'>{hint}</span> : null}
    </>
  )
  return (
    <Card data-genui-block='kpi-tile'>
      <CardContent className='flex flex-col items-start gap-1 p-3'>
        {onClick ? (
          <button type='button' className='flex w-full flex-col items-start gap-1 bg-transparent p-0 text-left' onClick={onClick}>
            {body}
          </button>
        ) : (
          body
        )}
        {cta ? (
          <Button size='sm' variant='secondary' onClick={cta.onClick}>
            {cta.label}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

function useValue() {
  const g = useGenUI()
  const raw = useRaw()
  const text = useText()
  return {
    value: (v: unknown, format?: string) => {
      const r = raw(v)
      if (r && typeof r === 'object' && '$t' in r) return text(r)
      return formatMetric(r, format, g.locale, g.currency)
    },
    trend: (v: unknown) => {
      const r = raw(v)
      return r === 'up' || r === 'down' || r === 'flat' ? r : undefined
    },
  }
}

/** `kpi_card`: una metrica con tendencia y CTA; `value`/`trend` admiten `$ref`. */
export function KpiCard({ block }: { block: PageKpiCardDef }) {
  const text = useText()
  const pc = usePageContext()
  const v = useValue()
  const run = usePageAction()
  const cta = block.cta as Obj | undefined
  return (
    <Tile
      label={text(block.label, pc)}
      value={v.value(block.value, block.format)}
      tone={block.tone}
      trend={v.trend(block.trend)}
      hint={block.hint ? text(block.hint, pc) : undefined}
      cta={cta && !cta.when ? { label: text(cta.label) || cta.do, onClick: () => run(cta, block.id) } : undefined}
    />
  )
}

/** `stats` de pagina: items con `$ref` y `action` por item (p. ej. `set` de un filtro). */
function PageStats({ block, data }: { block: PageBlockDef; data?: Record<string, unknown> }) {
  const text = useText()
  const pc = usePageContext()
  const g = useGenUI()
  const v = useValue()
  const run = usePageAction()
  const source = typeof block.source === 'string' ? block.source.slice(5) : undefined
  const rows = source !== undefined && g.sources && Object.hasOwn(g.sources, source) ? g.sources[source] : undefined
  const items: Obj[] = Array.isArray(block.items) ? block.items : (rows ?? []).slice(0, 12).map((r) => ({ label: String(r.label ?? ''), value: r.value }))
  if (!items.length && !block.items) return <Core block={block} data={data} />
  return (
    <div data-genui-block='stats' className={cn('grid gap-2', GRID_COLS[Math.min(4, Math.max(1, items.length))])}>
      {items.map((it, i) => (
        <Tile
          key={i}
          label={text(it.label, pc)}
          value={v.value(it.value, it.format ?? block.format)}
          tone={it.tone}
          trend={v.trend(it.trend)}
          hint={it.hint ? text(it.hint, pc) : undefined}
          onClick={it.action && !it.action.when ? () => run(it.action, block.id) : undefined}
        />
      ))}
    </div>
  )
}

// ---- map ----

const SELECT_ID = 'page.select'

/**
 * `map` de pagina: delega en el renderer `map` registrado (`@asteby/metacore-maps/genui`)
 * o en el respaldo accesible, y convierte la seleccion en estado (`select`) y en un
 * evento `select` del bus. El `on_select` declarado por el autor se sigue ejecutando.
 */
function PageMap({ block, data }: { block: PageMapDef; data?: Record<string, unknown> }) {
  const pc = usePageContext()
  const g = useGenUI()
  const { area: _a, when: _w, select, ...core } = block
  void _a; void _w
  const own = block.on_select as Obj | undefined
  const spec = useMemo(() => ({ version: 'genui/v2', ...(data ? { data } : {}), blocks: [{ ...core, on_select: { do: 'emit', id: SELECT_ID } }] }), [core, data])
  const onAction = (req: GenUIActionRequest) => {
    if (req.action.do === 'emit' && req.action.id === SELECT_ID) {
      const point = req.context?.point as { key?: string; label?: string } | undefined
      if (!point?.key) return
      if (typeof select === 'string' && select.startsWith('state.') && isSafePath(select.slice(6))) pc.setState(select.slice(6), point.key)
      pc.emit('select', { key: point.key, label: point.label }, block.id)
      if (own) {
        if (own.do === 'navigate' && typeof own.route?.path === 'string' && !own.confirm) g.onNavigate?.(own.route.path)
        else g.onAction?.({ action: own, blockId: block.id, context: req.context })
      }
      return
    }
    g.onAction?.(req)
  }
  return (
    <GenUIProvider onAction={onAction}>
      <GenUI spec={spec} fallback={<Fallback block={block} />} />
    </GenUIProvider>
  )
}

// ---- section ----

function sectionStatus(block: PageSectionDef, pc: PageContextValue, rows: unknown[] | undefined): 'loading' | 'error' | 'empty' | 'ready' {
  const name = typeof block.source === 'string' ? block.source.replace(/^data\./, '') : undefined
  if (!name) return 'ready'
  const st = pc.sourceStatus[name]
  if (st?.status === 'error') return 'error'
  if (st?.status === 'loading' || (!st && rows === undefined)) return 'loading'
  return rows && rows.length === 0 && block.empty ? 'empty' : 'ready'
}

const MSG = { denied: 'No tienes acceso a esta seccion.', failed: 'Esta seccion fallo al mostrarse.', error: 'No se pudo cargar.', retry: 'Reintentar', loading: 'Cargando' }

export function PageSection({ block, data }: { block: PageSectionDef; data?: Record<string, unknown> }) {
  const pc = usePageContext()
  const g = useGenUI()
  const text = useText()
  const mode: PageSectionMode = block.mode ?? 'declarative'
  if (block.permission && !pc.can(block.permission)) {
    return block.on_denied === 'notice' ? (
      <p role='status' data-genui-block='section-denied' className='m-0 rounded-lg border border-dashed p-3 text-sm text-muted-foreground'>
        {MSG.denied}
      </p>
    ) : null
  }
  const name = typeof block.source === 'string' ? block.source.replace(/^data\./, '') : undefined
  const rows = name !== undefined && g.sources && Object.hasOwn(g.sources, name) ? g.sources[name] : undefined
  const bare = block.chrome === 'bare'
  // `bare`: el host no pinta marco ni estados; la seccion (custom) los gestiona.
  const status = bare ? 'ready' : sectionStatus(block, pc, rows)

  let content: ReactNode
  if (status === 'loading') content = <div role='status' aria-busy='true' aria-label={MSG.loading} data-genui-block='section-loading' className='h-24 animate-pulse rounded-md bg-muted' />
  else if (status === 'error') {
    const st = pc.sourceStatus[name!]
    content = (
      <div role='alert' data-genui-block='section-error' className='flex flex-col items-start gap-2 text-sm'>
        <p className='m-0'>{st?.error || MSG.error}</p>
        {st?.retry ? (
          <Button size='sm' variant='secondary' onClick={st.retry}>
            {MSG.retry}
          </Button>
        ) : null}
      </div>
    )
  } else if (status === 'empty') content = <p data-genui-block='section-empty' className='m-0 text-sm text-muted-foreground'>{text(block.empty)}</p>
  else if (mode === 'custom') content = <CustomBody block={block} />
  else content = <>{(block.blocks ?? []).map((b, i) => <PageBlock key={b.id ?? i} block={b} data={data} allowExt={mode === 'hybrid'} />)}</>

  const title = !bare && block.title ? text(block.title) : undefined
  const framed = bare ? (
    <section aria-label={block.title ? text(block.title) : undefined} data-genui-block='section' data-mode={mode} data-chrome='bare'>
      {content}
    </section>
  ) : (
    <Card data-genui-block='section' data-mode={mode} data-chrome='card'>
      {title ? (
        <CardHeader className='pb-2'>
          <CardTitle className='text-sm'>{title}</CardTitle>
        </CardHeader>
      ) : null}
      <CardContent className={cn('flex flex-col gap-2', !title && 'pt-4')}>{content}</CardContent>
    </Card>
  )
  return (
    <SectionBoundary id={block.id} label={MSG.failed} retryLabel={MSG.retry}>
      {framed}
    </SectionBoundary>
  )
}

// ---- tabs / conmutador de vistas ----

function TabIconView({ name }: { name: unknown }) {
  const Icon = usePageIcon(name)
  return Icon ? <Icon className='size-4' aria-hidden /> : null
}

function TabBody({ opt, data }: { opt: PageTabOption; data?: Record<string, unknown> }) {
  return (
    <SectionBoundary id={opt.key} label={MSG.failed} retryLabel={MSG.retry}>
      {typeof opt.component === 'string' ? (
        <CustomBody block={{ type: 'section', id: opt.key, component: opt.component, props: opt.props } as PageSectionDef} />
      ) : (
        <>{(opt.blocks ?? []).map((b, i) => <PageBlock key={b.id ?? i} block={b} data={data} />)}</>
      )}
    </SectionBoundary>
  )
}

/**
 * `tabs` de pagina. Las vistas comparten el PageContext y las fuentes ya
 * resueltas (cambiar de vista no vuelve a pedir datos). Solo la vista activa se
 * monta (perezoso) salvo `keep_alive`. Semantica tablist/tab/tabpanel con
 * teclado (flechas, Home, End); en pantalla angosta pasa a select.
 */
function PageTabs({ block, data }: { block: PageTabsDef; data?: Record<string, unknown> }) {
  const pc = usePageContext()
  const text = useText()
  const narrow = useNarrow()
  const uid = useId()
  const [local, setLocal] = useState<string | undefined>(undefined)
  const [visited, setVisited] = useState<string[]>([])
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const opts = (Array.isArray(block.tabs) ? block.tabs : []).filter((o) => o && typeof o.key === 'string' && (!o.permission || pc.can(o.permission)))
  if (!opts.length) return null
  const bound = typeof block.state === 'string' && block.state.startsWith('state.') && isSafePath(block.state.slice(6)) ? block.state.slice(6) : undefined
  const stored = bound ? getPath(pc.state, bound) : local
  const keys = opts.map((o) => o.key)
  const active = typeof stored === 'string' && keys.includes(stored) ? stored : block.default && keys.includes(block.default) ? block.default : keys[0]!
  const select = (key: string) => {
    if (bound) pc.setState(bound, key)
    else setLocal(key)
    if (block.keep_alive) setVisited((v) => [...new Set([...v, active, key])])
  }
  const segmented = block.variant === 'segmented'
  const label = block.label ? text(block.label) : undefined
  const onKey = (e: KeyboardEvent) => {
    const i = keys.indexOf(active)
    const to = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % keys.length : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + keys.length) % keys.length : e.key === 'Home' ? 0 : e.key === 'End' ? keys.length - 1 : -1
    if (to < 0) return
    e.preventDefault()
    select(keys[to]!)
    refs.current[keys[to]!]?.focus()
  }
  const mounted = (key: string) => key === active || (!!block.keep_alive && visited.includes(key))

  const bar = narrow && block.mobile !== 'scroll' ? (
    <select aria-label={label ?? 'Vista'} data-genui-block='tabs-select' value={active} onChange={(e) => select(e.target.value)} className='h-9 rounded-md border bg-background px-2 text-sm'>
      {opts.map((o) => <option key={o.key} value={o.key}>{text(o.label)}</option>)}
    </select>
  ) : (
    <div
      role='tablist'
      aria-label={label}
      data-genui-block='tabs-list'
      data-variant={segmented ? 'segmented' : 'tabs'}
      onKeyDown={onKey}
      className={cn('flex max-w-full gap-1 overflow-x-auto', segmented ? 'rounded-lg bg-muted p-1' : 'border-b')}
    >
      {opts.map((o) => {
        const on = o.key === active
        return (
          <button
            key={o.key}
            ref={(el) => void (refs.current[o.key] = el)}
            type='button'
            role='tab'
            id={`${uid}-t-${o.key}`}
            aria-selected={on}
            aria-controls={`${uid}-p-${o.key}`}
            tabIndex={on ? 0 : -1}
            data-state={on ? 'active' : 'inactive'}
            onClick={() => select(o.key)}
            className={cn('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-sm font-medium transition-colors', segmented ? 'rounded-md' : '-mb-px border-b-2', on ? (segmented ? 'bg-background shadow-sm' : 'border-primary text-foreground') : 'border-transparent text-muted-foreground hover:text-foreground')}
          >
            <TabIconView name={o.icon} />
            {text(o.label)}
          </button>
        )
      })}
    </div>
  )
  const inner = (
    <>
      <div className={cn('flex', segmented ? 'justify-end' : 'justify-start')}>{bar}</div>
      {opts.map((o) =>
        mounted(o.key) ? (
          <div key={o.key} role='tabpanel' id={`${uid}-p-${o.key}`} aria-labelledby={`${uid}-t-${o.key}`} hidden={o.key !== active} data-view={o.key} className='flex flex-col gap-2'>
            <TabBody opt={o} data={data} />
          </div>
        ) : null,
      )}
    </>
  )
  return block.chrome === 'card' ? (
    <Card data-genui-block='tabs' data-chrome='card'>
      <CardContent className='flex flex-col gap-2 pt-4'>{inner}</CardContent>
    </Card>
  ) : (
    <div data-genui-block='tabs' data-chrome='bare' className='flex flex-col gap-2'>
      {inner}
    </div>
  )
}

// ---- custom / ext ----

function useBreakpoint() {
  return useNarrow() ? ('narrow' as const) : ('wide' as const)
}

/** Monta un `BlockDefinition` con el contrato block@1: solo lo declarado entra y sale. */
function CustomMount({ def, props, id }: { def: BlockDefinition<any>; props: Obj; id?: string }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const pc = usePageContext()
  const g = useGenUI()
  const breakpoint = useBreakpoint()
  if (def.permission && !pc.can(def.permission)) return null
  const context: Record<string, unknown> = {}
  for (const r of def.reads ?? []) context[r] = resolveRef(r, { state: pc.state, ctx: pc.ctx })
  const data: Record<string, BlockData> = {}
  for (const n of def.data ?? []) {
    const st = pc.sourceStatus[n]
    const rows = g.sources && Object.hasOwn(g.sources, n) ? g.sources[n] : undefined
    data[n] = st?.status === 'error' ? { status: 'error', error: st.error } : st?.status === 'loading' || (!st && rows === undefined) ? { status: 'loading' } : { status: 'ready', rows }
  }
  const emit = (event: string, payload?: Obj) => {
    if (event === 'set') {
      const key = payload?.key
      if (typeof key === 'string' && (def.writes ?? []).includes(key) && key.startsWith('state.')) pc.setState(key.slice(6), payload?.value)
      return
    }
    if ((def.events ?? []).includes(event)) pc.emit(event, payload, id ?? def.name)
  }
  const View = def.component
  return <View props={props} context={context} data={data} emit={emit as never} size={{ breakpoint }} />
}

function CustomStub({ name, fallback }: { name: string; fallback?: string }) {
  return (
    <p role='status' data-genui-block='custom-stub' data-component={name} className='m-0 rounded-lg border border-dashed p-3 text-sm text-muted-foreground'>
      {fallback || `Bloque personalizado no disponible: ${name}`}
    </p>
  )
}

function CustomBody({ block }: { block: PageSectionDef }) {
  const name = block.component
  const def = typeof name === 'string' ? getPageBlock(name) : undefined
  if (!name || !def) return <CustomStub name={String(name ?? '')} fallback={block.fallback} />
  return <CustomMount def={def} props={block.props ?? {}} id={block.id} />
}

function ExtBlock({ block }: { block: PageBlockDef }) {
  const def = typeof block.ext === 'string' ? getPageBlock(block.ext) : undefined
  if (!def) return <CustomStub name={String(block.ext ?? '')} fallback={block.fallback} />
  return (
    <SectionBoundary id={block.id} label={MSG.failed} retryLabel={MSG.retry}>
      <CustomMount def={def} props={block.props ?? {}} id={block.id} />
    </SectionBoundary>
  )
}

// ---- documento ----

export interface PageViewProps extends Omit<PageProviderProps, 'initialState' | 'children'> {
  /** Cuerpo `ui` de la pagina: `{ state, data, blocks }`. */
  ui: { state?: Record<string, unknown>; data?: Record<string, unknown>; blocks: PageBlockDef[] }
  className?: string
}

/** Pagina completa: `PageProvider` (estado inicial de `ui.state`, `url_state`, permisos) + sus bloques. */
export function PageView({ ui, className, ...provider }: PageViewProps) {
  return (
    <PageProvider initialState={ui.state} {...provider}>
      <div className={cn('@container flex w-full flex-col gap-2', className)} data-genui='page'>
        <PageBlocks blocks={ui.blocks} data={ui.data} />
      </div>
    </PageProvider>
  )
}
