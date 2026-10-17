/**
 * `create-metacore-addon add view --type <map|timeline|calendar|chart|split>`
 *
 * Adds a DECLARATIVE view (level A: zero JavaScript in the addon) to an
 * existing manifest.json: one navigation entry with `view_type` + the matching
 * `view.<type>` block, the grammar of the kernel (NavView, MapView,
 * TimelineView, CalendarView, ChartView, SplitView). Fields not given as flags
 * are inferred from the model's columns; the result is meant to pass
 * `metacore validate` untouched (the test suite validates the output with the
 * kernel itself).
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const VIEW_TYPES = ['map', 'timeline', 'calendar', 'chart', 'split'] as const
export type ViewType = (typeof VIEW_TYPES)[number]

export const CHART_KINDS = ['bar', 'line', 'area', 'pie', 'donut'] as const

export interface AddViewOptions {
  type: ViewType
  /** Model key (`Shipment`). Default: the manifest's only model. */
  model?: string
  /** Nav entry title (i18n key or text). Default: `<Model> (<type>)`. */
  title?: string
  icon?: string
  permission?: string
  /** Navigation group index or title. Default: the first group. */
  group?: string
  // map
  lat?: string
  lng?: string
  geometry?: string
  colorBy?: string
  popup?: string[]
  cluster?: boolean
  // timeline / calendar
  dateField?: string
  titleField?: string
  statusField?: string
  descriptionField?: string
  startField?: string
  endField?: string
  // chart
  chartKind?: (typeof CHART_KINDS)[number]
  groupBy?: string
  aggregate?: 'count' | 'sum' | 'avg' | 'min' | 'max'
  field?: string
  range?: string
  // split
  columns?: string[]
}

interface Column {
  name: string
  type?: string
  primary_key?: boolean
}
interface ModelDef {
  key: string
  columns?: Column[]
}
type Json = Record<string, any>

const SYSTEM = new Set(['id', 'organization_id', 'created_at', 'updated_at', 'deleted_at', 'created_by', 'updated_by'])
const DATE_TYPES = /^(timestamptz|timestamp|date|datetime)/i
const TEXT_TYPES = /^(text|varchar|string|citext)/i
const NUM_TYPES = /^(numeric|decimal|double|float|real|int|bigint|smallint)/i

const ICONS: Record<ViewType, string> = {
  map: 'Map',
  timeline: 'History',
  calendar: 'CalendarDays',
  chart: 'BarChart3',
  split: 'PanelsLeftRight',
}

function cols(model: ModelDef): Column[] {
  return model.columns ?? []
}

function has(model: ModelDef, name: string | undefined): boolean {
  return !!name && cols(model).some((c) => c.name === name)
}

function first(model: ModelDef, test: (c: Column) => boolean): string | undefined {
  return cols(model).find((c) => !SYSTEM.has(c.name) && test(c))?.name
}

function pick(model: ModelDef, names: RegExp, type?: RegExp): string | undefined {
  return cols(model).find((c) => names.test(c.name) && (!type || type.test(c.type ?? '')))?.name
}

function requireColumn(model: ModelDef, name: string | undefined, flag: string): string {
  if (!name) {
    throw new Error(`add view: cannot infer --${flag} for model "${model.key}"; pass it explicitly.`)
  }
  if (!has(model, name)) {
    throw new Error(`add view: --${flag} "${name}" is not a column of model "${model.key}".`)
  }
  return name
}

/** Build the `view.<type>` block for the model. Pure; throws with the flag to pass. */
export function buildView(model: ModelDef, o: AddViewOptions): Json {
  const titleCol = () => o.titleField ?? titleColumn(model)
  switch (o.type) {
    case 'map': {
      if (o.geometry) {
        return { map: { geometry: requireColumn(model, o.geometry, 'geometry'), ...mapExtras(model, o) } }
      }
      const lat = requireColumn(model, o.lat ?? pick(model, /(^|_)(lat|latitude)$/), 'lat')
      const lng = requireColumn(model, o.lng ?? pick(model, /(^|_)(lng|lon|long|longitude)$/), 'lng')
      return { map: { point: { lat, lng }, ...mapExtras(model, o) } }
    }
    case 'timeline': {
      const view: Json = {
        date_field: requireColumn(model, o.dateField ?? first(model, (c) => DATE_TYPES.test(c.type ?? '')) ?? pick(model, /^created_at$/), 'date-field'),
        title_field: requireColumn(model, titleCol(), 'title-field'),
      }
      const status = o.statusField ?? pick(model, /^(status|state|stage)$/)
      if (status) view.status_field = requireColumn(model, status, 'status-field')
      if (o.descriptionField) view.description_field = requireColumn(model, o.descriptionField, 'description-field')
      return { timeline: view }
    }
    case 'calendar': {
      const view: Json = {
        start_field: requireColumn(model, o.startField ?? first(model, (c) => DATE_TYPES.test(c.type ?? '')), 'start-field'),
      }
      if (o.endField) view.end_field = requireColumn(model, o.endField, 'end-field')
      const title = titleCol()
      if (title) view.title_field = requireColumn(model, title, 'title-field')
      const color = o.colorBy ?? pick(model, /^(status|state|stage)$/)
      if (color) view.color_by = requireColumn(model, color, 'color-by')
      return { calendar: view }
    }
    case 'chart': {
      const kind = o.chartKind ?? 'bar'
      if (!(CHART_KINDS as readonly string[]).includes(kind)) {
        throw new Error(`add view: --chart-kind must be one of ${CHART_KINDS.join(', ')}`)
      }
      const query: Json = { model: model.key }
      const aggregate = o.aggregate ?? 'count'
      if (aggregate !== 'count') {
        query.aggregate = aggregate
        query.field = requireColumn(model, o.field ?? first(model, (c) => NUM_TYPES.test(c.type ?? '')), 'field')
      }
      if (kind === 'line' || kind === 'area') {
        query.date_field = requireColumn(model, o.dateField ?? first(model, (c) => DATE_TYPES.test(c.type ?? '')) ?? pick(model, /^created_at$/), 'date-field')
        query.interval = 'day'
      } else {
        query.group_by = requireColumn(
          model,
          o.groupBy ?? pick(model, /^(status|state|stage|type|category|carrier)$/) ?? first(model, (c) => TEXT_TYPES.test(c.type ?? '')),
          'group-by',
        )
      }
      query.range = o.range ?? 'last_30_days'
      return { chart: { kind, query } }
    }
    case 'split': {
      const columns = o.columns && o.columns.length > 0
        ? o.columns.map((c) => requireColumn(model, c, 'columns'))
        : cols(model).filter((c) => !SYSTEM.has(c.name) && !c.primary_key).slice(0, 4).map((c) => c.name)
      return { split: columns.length > 0 ? { columns } : {} }
    }
  }
}

function mapExtras(model: ModelDef, o: AddViewOptions): Json {
  const out: Json = {}
  if (o.cluster !== false) out.cluster = true
  const color = o.colorBy ?? pick(model, /^(status|state|stage)$/)
  if (color) out.color_by = requireColumn(model, color, 'color-by')
  const popup = o.popup ?? [titleColumn(model), color].filter((x): x is string => !!x)
  if (popup.length > 0) out.popup = popup.slice(0, 8).map((c) => requireColumn(model, c, 'popup'))
  out.fit = 'data'
  return out
}

function titleColumn(model: ModelDef): string | undefined {
  return pick(model, /^(title|name|label|code|tracking_number|number|folio)$/) ?? first(model, (c) => TEXT_TYPES.test(c.type ?? ''))
}

/**
 * Add the view to a parsed manifest (returns a new object; input untouched).
 * Creates `contributions.navigation[0]` when the manifest has none.
 */
export function addViewToManifest(manifest: Json, o: AddViewOptions): { manifest: Json; item: Json } {
  if (!(VIEW_TYPES as readonly string[]).includes(o.type)) {
    throw new Error(`add view: --type must be one of ${VIEW_TYPES.join(', ')}`)
  }
  const out: Json = JSON.parse(JSON.stringify(manifest))
  const models: ModelDef[] = out.models ?? []
  if (models.length === 0) throw new Error('add view: the manifest declares no models; views render a model.')
  const model = o.model ? models.find((m) => m.key === o.model) : models.length === 1 ? models[0] : undefined
  if (!model) {
    throw new Error(
      o.model
        ? `add view: model "${o.model}" not found (models: ${models.map((m) => m.key).join(', ')})`
        : `add view: pass --model (models: ${models.map((m) => m.key).join(', ')})`,
    )
  }
  const item: Json = {
    title: o.title ?? `${model.key} (${o.type})`,
    model: model.key,
    icon: o.icon ?? ICONS[o.type],
    view_type: o.type,
    view: buildView(model, o),
  }
  if (o.permission) item.permission = o.permission

  out.contributions ??= {}
  out.contributions.navigation ??= []
  const nav: Json[] = out.contributions.navigation
  let group: Json | undefined
  if (o.group !== undefined) {
    const idx = Number(o.group)
    group = Number.isInteger(idx) ? nav[idx] : nav.find((g) => g.title === o.group)
    if (!group) throw new Error(`add view: navigation group "${o.group}" not found`)
  } else {
    group = nav[0]
  }
  if (!group) {
    group = { title: out.metadata?.name ?? model.key, icon: ICONS[o.type], items: [] }
    nav.push(group)
  }
  group.items ??= []
  const dup = (group.items as Json[]).find((it) => it.model === model.key && it.view_type === o.type)
  if (dup) throw new Error(`add view: "${model.key}" already has a ${o.type} view in this navigation group`)
  group.items.push(item)
  return { manifest: out, item }
}

function list(v: string | undefined): string[] | undefined {
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined
}

/** CLI entry: `add view [dir] --type … [flags]`. */
export async function runAddView(argv: string[]): Promise<void> {
  const { Command } = await import('commander')
  const cmd = new Command('add view')
    .argument('[dir]', 'addon directory (contains manifest.json)', '.')
    .requiredOption('--type <type>', VIEW_TYPES.join('|'))
    .option('--model <key>')
    .option('--title <text>')
    .option('--icon <lucide>')
    .option('--permission <perm>')
    .option('--group <indexOrTitle>')
    .option('--lat <column>')
    .option('--lng <column>')
    .option('--geometry <column>')
    .option('--color-by <column>')
    .option('--popup <columns>', 'comma separated')
    .option('--no-cluster')
    .option('--date-field <column>')
    .option('--title-field <column>')
    .option('--status-field <column>')
    .option('--description-field <column>')
    .option('--start-field <column>')
    .option('--end-field <column>')
    .option('--chart-kind <kind>', CHART_KINDS.join('|'))
    .option('--group-by <column>')
    .option('--aggregate <fn>', 'count|sum|avg|min|max')
    .option('--field <column>')
    .option('--range <range>')
    .option('--columns <columns>', 'comma separated')
    .option('--dry-run', 'print the navigation entry, do not write')
    .exitOverride()
  cmd.parse(argv, { from: 'user' })
  const f = cmd.opts()
  const dir = path.resolve(process.cwd(), cmd.args[0] ?? '.')
  const file = path.join(dir, 'manifest.json')
  const raw = await readFile(file, 'utf8')
  const { manifest, item } = addViewToManifest(JSON.parse(raw), {
    type: f.type,
    model: f.model,
    title: f.title,
    icon: f.icon,
    permission: f.permission,
    group: f.group,
    lat: f.lat,
    lng: f.lng,
    geometry: f.geometry,
    colorBy: f.colorBy,
    popup: list(f.popup),
    cluster: f.cluster,
    dateField: f.dateField,
    titleField: f.titleField,
    statusField: f.statusField,
    descriptionField: f.descriptionField,
    startField: f.startField,
    endField: f.endField,
    chartKind: f.chartKind,
    groupBy: f.groupBy,
    aggregate: f.aggregate,
    field: f.field,
    range: f.range,
    columns: list(f.columns),
  })
  if (f.dryRun) {
    process.stdout.write(JSON.stringify(item, null, 2) + '\n')
    return
  }
  await writeFile(file, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  process.stdout.write(
    `✓ Added ${item.view_type} view of ${item.model} to ${path.relative(process.cwd(), file) || 'manifest.json'}\n` +
      `  Validate with: metacore validate ${path.relative(process.cwd(), dir) || '.'}\n`,
  )
}
