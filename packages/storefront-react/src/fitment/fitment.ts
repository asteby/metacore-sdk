// Vehicle fitment ("Mi vehículo"): a make → model → year → engine catalog, vehicle keys, the
// cascading selector options and the fit state of a product. Pure functions with no UI, no
// storage and no copy: every tag prefix, attribute name and legacy spelling is injectable through
// `FitmentConfig`, so any store that sells parts can use it. Nothing here decides on its own
// whether a part fits a vehicle: it only compares what the backend (OPS) published.

export type VehicleEngine = { id: string; label: string; from?: number; to?: number }
export type VehicleModel = { id: string; label: string; from: number; to: number; engines: VehicleEngine[] }
export type MakePriority = 'high' | 'medium' | 'low'
/**
 * A make of the catalog. `models` may be empty while the catalog is being imported: the make is
 * declared but it does not show in the selector until it has models.
 */
export type VehicleMake = {
  id: string
  label: string
  models: VehicleModel[]
  priority?: MakePriority
  /** Free-form segment of the make (e.g. light / heavy duty). Passed through as published. */
  kind?: string
  refs?: number
  observed_from?: number
  observed_to?: number
  typical_from?: number
  typical_to?: number
}
export type VehicleCatalog = { makes: VehicleMake[] }

/** Partial selection of the selector (all text, as it arrives from a form). */
export type VehicleDraft = { make: string; year: string; model: string; engine: string }

/** A complete vehicle resolved against the catalog (with labels to display). */
export type Vehicle = {
  key: string
  make: { id: string; label: string }
  model: { id: string; label: string }
  year: number
  engine: { id: string; label: string }
}

export type Option = { value: string; label: string }

/** Fit state of a product for a vehicle. */
export type Fit = 'fits' | 'universal' | 'no' | 'unknown'

export type FitmentConfig = {
  /** Prefix of the tags that publish compatibility: `<prefix><vehicle key>`. Default `fit:`. */
  tagPrefix: string
  /** Tag that means "fits everything". Default `<tagPrefix>universal`. */
  universalTag: string
  /** Prefix of the single resolved-state tag written by `withFit`. Default `fit-state:`. */
  stateTagPrefix: string
  /** Product attribute holding the compatibility table. Default `compatibility`. */
  compatAttribute: string
  /** Separators of the compact compatibility table. */
  rowSeparator: string
  cellSeparator: string
}

export const DEFAULT_FITMENT_CONFIG: FitmentConfig = {
  tagPrefix: 'fit:',
  universalTag: 'fit:universal',
  stateTagPrefix: 'fit-state:',
  compatAttribute: 'compatibility',
  rowSeparator: ';',
  cellSeparator: '|',
}

/** Merges overrides; an unset `universalTag` follows a custom `tagPrefix`. */
export function fitmentConfig(overrides: Partial<FitmentConfig> = {}): FitmentConfig {
  const tagPrefix = overrides.tagPrefix ?? DEFAULT_FITMENT_CONFIG.tagPrefix
  return {
    ...DEFAULT_FITMENT_CONFIG,
    ...overrides,
    tagPrefix,
    universalTag: overrides.universalTag ?? `${tagPrefix}universal`,
  }
}

export const EMPTY_DRAFT: VehicleDraft = { make: '', year: '', model: '', engine: '' }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0

export type ParseCatalogOptions = {
  /** Maps the backend's spelling of a priority to the canonical one (e.g. `{ alta: 'high' }`). English values always work. */
  priorityAliases?: Record<string, MakePriority>
}

function makeMeta(m: Record<string, unknown>, aliases: Record<string, MakePriority>): Partial<VehicleMake> {
  const raw = typeof m.priority === 'string' ? m.priority.toLowerCase() : ''
  const priority = aliases[raw] ?? raw
  const out: Partial<VehicleMake> = {}
  if (priority === 'high' || priority === 'medium' || priority === 'low') out.priority = priority
  if (isText(m.kind)) out.kind = m.kind
  for (const k of ['refs', 'observed_from', 'observed_to', 'typical_from', 'typical_to'] as const) {
    if (isNum(m[k])) out[k] = m[k] as number
  }
  return out
}

/** "np300-frontier" → "NP300 FRONTIER"; "1.9-tdi" → "1.9 TDI". */
function labelFromId(id: string): string {
  return id.split('-').filter(Boolean).join(' ').toUpperCase()
}

/**
 * Reads the vehicle catalog from the props of a content section; drops whatever has the wrong shape.
 * Accepts the compact format (a real catalog weighs tens of KB and OPS caps each write): a model may
 * be a tuple `[id, from, to, engines]`, omit `label` (derived from the id) and list engines as ids.
 * Props stored as text (`makes` as a JSON string) are parsed.
 */
export function parseCatalog(raw: unknown, opts: ParseCatalogOptions = {}): VehicleCatalog {
  let makesRaw = (raw as { makes?: unknown } | null | undefined)?.makes
  if (typeof makesRaw === 'string') {
    try {
      makesRaw = JSON.parse(makesRaw)
    } catch {
      makesRaw = []
    }
  }
  const aliases = opts.priorityAliases ?? {}
  const makes: VehicleMake[] = []
  for (const m of Array.isArray(makesRaw) ? makesRaw : []) {
    if (!m || !isText(m.id) || !isText(m.label) || !Array.isArray(m.models)) continue
    const models: VehicleModel[] = []
    for (const entry of m.models) {
      const mo = Array.isArray(entry) ? { id: entry[0], from: entry[1], to: entry[2], engines: entry[3] } : entry
      if (!mo || !isText(mo.id) || !isNum(mo.from) || !isNum(mo.to) || !Array.isArray(mo.engines)) continue
      const engines: VehicleEngine[] = mo.engines
        .map((e: unknown) => (typeof e === 'string' ? { id: e, label: labelFromId(e) } : e))
        .filter((e: VehicleEngine) => e && isText(e.id))
        .map((e: VehicleEngine) => ({
          id: e.id,
          label: isText(e.label) ? e.label : labelFromId(e.id),
          ...(isNum(e.from) ? { from: e.from } : {}),
          ...(isNum(e.to) ? { to: e.to } : {}),
        }))
      if (engines.length) models.push({ id: mo.id, label: isText(mo.label) ? mo.label : labelFromId(mo.id), from: mo.from, to: mo.to, engines })
    }
    // A make declared without models (waiting for the import) is kept; one with only invalid models is dropped.
    if (models.length || m.models.length === 0) makes.push({ id: m.id, label: m.label, models, ...makeMeta(m, aliases) })
  }
  return { makes }
}

export function vehicleKey(v: { make: string; model: string; year: number | string; engine: string }): string {
  return `${v.make}/${v.model}/${v.year}/${v.engine}`
}

/** Tag that marks a part as fitting the vehicle with this key. */
export function fitTag(key: string, config: FitmentConfig = DEFAULT_FITMENT_CONFIG): string {
  return `${config.tagPrefix}${key}`
}

const engineCovers = (e: VehicleEngine, model: VehicleModel, year: number) =>
  year >= (e.from ?? model.from) && year <= (e.to ?? model.to)

const modelCovers = (m: VehicleModel, year: number | null) => year == null || (year >= m.from && year <= m.to)

function num(v: string): number | null {
  const n = Number(v)
  return v !== '' && Number.isInteger(n) ? n : null
}

/** Resolves a `make/model/year/engine` key against the catalog; null when it does not exist. */
export function resolveVehicle(catalog: VehicleCatalog, key: string | null | undefined): Vehicle | null {
  if (!key) return null
  const [makeId, modelId, yearText, engineId] = key.split('/')
  const year = num(yearText ?? '')
  const make = catalog.makes.find((m) => m.id === makeId)
  const model = make?.models.find((m) => m.id === modelId)
  if (!make || !model || year == null || !modelCovers(model, year)) return null
  const engine = model.engines.find((e) => e.id === engineId && engineCovers(e, model, year))
  if (!engine) return null
  return {
    key: vehicleKey({ make: make.id, model: model.id, year, engine: engine.id }),
    make: { id: make.id, label: make.label },
    model: { id: model.id, label: model.label },
    year,
    engine: { id: engine.id, label: engine.label },
  }
}

/** Short name for chips and badges: "Make Model 2018". */
export function vehicleName(v: Vehicle): string {
  return `${v.make.label} ${v.model.label} ${v.year}`
}

/** With engine: "Make Model 2018 · 1.6 L". */
export function vehicleLongName(v: Vehicle): string {
  return `${vehicleName(v)} · ${v.engine.label}`
}

// --- Cascade make → year → model → engine ------------------------------------------------------
// Every list filters by what is already chosen, in any order. With nothing chosen they show
// everything (so the form also works without JavaScript).

function modelsOf(catalog: VehicleCatalog, draft: Pick<VehicleDraft, 'make' | 'year'>): { make: VehicleMake; model: VehicleModel }[] {
  const year = num(draft.year)
  return catalog.makes
    .filter((m) => !draft.make || m.id === draft.make)
    .flatMap((make) => make.models.filter((m) => modelCovers(m, year)).map((model) => ({ make, model })))
}

export function makeOptions(catalog: VehicleCatalog): Option[] {
  return catalog.makes.filter((m) => m.models.length > 0).map((m) => ({ value: m.id, label: m.label }))
}

export function yearOptions(catalog: VehicleCatalog, draft: Pick<VehicleDraft, 'make' | 'model'>): Option[] {
  const models = catalog.makes
    .filter((m) => !draft.make || m.id === draft.make)
    .flatMap((m) => m.models)
    .filter((m) => !draft.model || m.id === draft.model)
  if (models.length === 0) return []
  const from = Math.min(...models.map((m) => m.from))
  const to = Math.max(...models.map((m) => m.to))
  const years: Option[] = []
  for (let y = to; y >= from; y--) years.push({ value: String(y), label: String(y) })
  return years
}

/**
 * Model options. Model ids repeat across makes (`pick-up` exists in several): with no make chosen
 * the value is `make/model` (unique) and `splitModelValue` sets the make when it is picked; with a
 * make chosen the value is the model id.
 */
export function modelOptions(catalog: VehicleCatalog, draft: Pick<VehicleDraft, 'make' | 'year'>): Option[] {
  return modelsOf(catalog, draft).map(({ make, model }) => ({
    value: draft.make ? model.id : `${make.id}/${model.id}`,
    label: draft.make ? model.label : `${make.label} ${model.label}`,
  }))
}

/** `make/model` (value of the make-less list) → { make, model }; a bare id returns only the model. */
export function splitModelValue(value: string): { make?: string; model: string } {
  const i = value.indexOf('/')
  return i === -1 ? { model: value } : { make: value.slice(0, i), model: value.slice(i + 1) }
}

export function engineOptions(catalog: VehicleCatalog, draft: Pick<VehicleDraft, 'make' | 'year' | 'model'>): Option[] {
  const year = num(draft.year)
  const seen = new Map<string, string>()
  for (const { model } of modelsOf(catalog, draft).filter(({ model }) => !draft.model || model.id === draft.model)) {
    for (const e of model.engines) {
      if (year == null || engineCovers(e, model, year)) seen.set(e.id, e.label)
    }
  }
  return [...seen].map(([value, label]) => ({ value, label }))
}

/** Drops what was chosen and is no longer valid after changing another field. */
export function reconcileDraft(catalog: VehicleCatalog, draft: VehicleDraft): VehicleDraft {
  let next = { ...draft }
  if (next.year && !yearOptions(catalog, { make: next.make, model: '' }).some((o) => o.value === next.year)) next = { ...next, year: '' }
  // A bare model id sets the make only when it belongs to a single one; repeated ids are ambiguous and dropped.
  if (next.model && !next.make) {
    const owners = catalog.makes.filter((m) => m.models.some((mo) => mo.id === next.model))
    const [owner] = owners
    if (owners.length === 1 && owner) next = { ...next, make: owner.id }
  }
  if (next.model && !modelOptions(catalog, next).some((o) => o.value === next.model)) next = { ...next, model: '' }
  if (next.engine && !engineOptions(catalog, next).some((o) => o.value === next.engine)) next = { ...next, engine: '' }
  return next
}

export function draftFromVehicle(v: Vehicle | null): VehicleDraft {
  return v ? { make: v.make.id, year: String(v.year), model: v.model.id, engine: v.engine.id } : EMPTY_DRAFT
}

/** Complete vehicle from the form, validated against the catalog. */
export function vehicleFromDraft(catalog: VehicleCatalog, draft: VehicleDraft): Vehicle | null {
  return resolveVehicle(catalog, vehicleKey({ make: draft.make, model: draft.model, year: draft.year, engine: draft.engine }))
}

// --- Popular vehicles --------------------------------------------------------------------------
// They come from the data: makes with `high` priority in the catalog, most references first.

export function popularMakes(catalog: VehicleCatalog): VehicleMake[] {
  return catalog.makes.filter((m) => m.priority === 'high' && m.models.length > 0).sort((a, b) => (b.refs ?? 0) - (a.refs ?? 0))
}

/**
 * One shortcut per popular make: its first model in a typical year (the middle of the make's typical
 * range, clamped to the model's range) with the first engine that covers that year.
 */
export function popularVehicles(catalog: VehicleCatalog, limit = 6): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = []
  for (const make of popularMakes(catalog)) {
    if (out.length >= limit) break
    const model = make.models[0]
    if (!model) continue
    const mid = make.typical_from != null && make.typical_to != null ? Math.round((make.typical_from + make.typical_to) / 2) : model.to
    const year = Math.min(model.to, Math.max(model.from, mid))
    const engine = model.engines.find((e) => engineCovers(e, model, year))
    if (!engine) continue
    out.push({ key: vehicleKey({ make: make.id, model: model.id, year, engine: engine.id }), label: `${make.label} ${model.label} ${year}` })
  }
  return out
}

// --- Fitment -----------------------------------------------------------------------------------

type WithTags = { tags: readonly string[] }
type WithAttributes = { attributes: Record<string, unknown> }

/**
 * Does the part fit the vehicle? Only compares what the backend published: a `<prefix><key>` tag
 * (fits), the universal tag (fits everything) or, when the part has other fit tags, no fit. With no
 * fitment data nothing is asserted ("unknown").
 */
export function fitStatus(product: WithTags, vehicle: { key: string } | null, config: FitmentConfig = DEFAULT_FITMENT_CONFIG): Fit {
  const fits = product.tags.filter((t) => t.startsWith(config.tagPrefix))
  if (fits.length === 0) return 'unknown'
  if (fits.includes(config.universalTag)) return 'universal'
  if (!vehicle) return 'unknown'
  return fits.includes(fitTag(vehicle.key, config)) ? 'fits' : 'no'
}

/** Values for a `filter.tag` query that lists only what fits (the API takes them as "any of"). */
export function fitFilterTags(vehicle: { key: string }, config: FitmentConfig = DEFAULT_FITMENT_CONFIG): string[] {
  return [fitTag(vehicle.key, config), config.universalTag]
}

export type CompatRow = { make: string; model: string; years: string; engine: string; note: string | null }

/** Compatibility table: the attribute holds "Make|Model|Years|Engine|Note;Make|…". */
export function compatRows(product: WithAttributes, config: FitmentConfig = DEFAULT_FITMENT_CONFIG): CompatRow[] {
  const raw = product.attributes[config.compatAttribute]
  if (typeof raw !== 'string' || !raw) return []
  return raw
    .split(config.rowSeparator)
    .map((row) => row.split(config.cellSeparator).map((c) => c.trim()))
    .flatMap((c): CompatRow[] => {
      const [make, model, years, engine, note] = c
      return c.length >= 4 && make && model ? [{ make, model, years: years ?? '', engine: engine ?? '', note: note || null }] : []
    })
}

/** "2012-2019" contains the year (a bare "2016" too). */
export function rowCoversYear(years: string, year: number): boolean {
  const [from, to] = years.split(/[–-]/).map((s) => Number(s.trim()))
  if (from === undefined || !Number.isFinite(from)) return false
  return year >= from && year <= (to !== undefined && Number.isFinite(to) ? to : from)
}

/**
 * The backend publishes one tag per compatible year and engine (hundreds per part). Loaders replace
 * them with ONE `<stateTagPrefix><state>` tag, resolved for the chosen vehicle, so they are not
 * serialized into the page.
 */
export function withFit<T extends WithTags>(product: T, vehicle: { key: string } | null, config: FitmentConfig = DEFAULT_FITMENT_CONFIG): T {
  const state = fitStatus(product, vehicle, config)
  return { ...product, tags: [...product.tags.filter((t) => !t.startsWith(config.tagPrefix)), `${config.stateTagPrefix}${state}`] }
}

/** Fit state already resolved by `withFit` ("unknown" if the product did not go through it). */
export function fitState(product: WithTags, config: FitmentConfig = DEFAULT_FITMENT_CONFIG): Fit {
  const tag = product.tags.find((t) => t.startsWith(config.stateTagPrefix))
  const value = tag?.slice(config.stateTagPrefix.length)
  return value === 'fits' || value === 'universal' || value === 'no' ? value : 'unknown'
}

/** Validates a redirect target: only relative paths of the own site. */
export function safeRedirect(target: string | null | undefined, fallback = '/'): string {
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') && !target.includes('\\') ? target : fallback
}

/** Removes the selector's error flag (default `?vehicle=invalid`) from a path so it can be returned to clean. */
export function withoutQueryParam(path: string, param: string): string {
  const url = new URL(path, 'http://local.invalid')
  url.searchParams.delete(param)
  return `${url.pathname}${url.search}`
}
