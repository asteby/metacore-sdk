// Public per-vehicle pages (index → make → model → year): pure logic over the vehicle catalog, no UI and no copy.
// It never decides fitment: it only lists which makes, models, years and engines the catalog has and which fit tags to
// ask the backend for (the backend filters with `tags_any`). A store wires these into its own routes, so the pages exist
// in every storefront with the same rules (crawlable URLs, a year without parts is `noindex`, no phantom years).

import type { Product, ProductConnection, ProductListParams } from '@asteby/storefront'
import { DEFAULT_FITMENT_CONFIG, engineCovers, fitKeyVariants, fitTag, modelCovers, vehicleKey, type FitmentConfig, type VehicleCatalog, type VehicleEngine, type VehicleMake, type VehicleModel } from './fitment.js'

/** The Storefront API takes at most this many values in `tags_any`. */
export const TAGS_PER_QUERY = 5

export function findMake(catalog: VehicleCatalog, id: string | undefined): VehicleMake | undefined {
  return id ? catalog.makes.find((m) => m.id === id && m.models.length > 0) : undefined
}

export function findModel(make: VehicleMake | undefined, id: string | undefined): VehicleModel | undefined {
  return id ? make?.models.find((m) => m.id === id) : undefined
}

/** Makes that have models: `high` priority first, then by name. */
export function listedMakes(catalog: VehicleCatalog): VehicleMake[] {
  const rank = { high: 0, medium: 1, low: 2 } as const
  return catalog.makes
    .filter((m) => m.models.length > 0)
    .sort((a, b) => rank[a.priority ?? 'low'] - rank[b.priority ?? 'low'] || a.label.localeCompare(b.label))
}

/** Years some engine of the model has parts for, newest first (no phantom years inside `from`–`to`). */
export function modelYears(model: VehicleModel): number[] {
  const out: number[] = []
  for (let y = model.to; y >= model.from; y--) if (modelCovers(model, y)) out.push(y)
  return out
}

export function enginesForYear(model: VehicleModel, year: number): VehicleEngine[] {
  return model.engines.filter((e) => engineCovers(e, model, year))
}

/** `'2012'` → 2012; anything else, or a year the model does not cover, → null. */
export function parseYear(model: VehicleModel, text: string | undefined): number | null {
  if (!text || !/^\d{4}$/.test(text)) return null
  const y = Number(text)
  return modelCovers(model, y) && y >= model.from && y <= model.to ? y : null
}

/** Fit tags (with every make alias) of each engine of that year. The universal tag is left out on purpose: a universal part does not tell one vehicle from another and would make every year page near-identical. */
export function yearTags(make: Pick<VehicleMake, 'id'>, model: VehicleModel, year: number, config: FitmentConfig = DEFAULT_FITMENT_CONFIG): string[] {
  const tags = enginesForYear(model, year).flatMap((e) => fitKeyVariants(vehicleKey({ make: make.id, model: model.id, year, engine: e.id }), config).map((k) => fitTag(k, config)))
  return [...new Set(tags)]
}

/** Groups of tags for the backend, at most `size` (default `TAGS_PER_QUERY`) per query. */
export function chunkTags(tags: readonly string[], size = TAGS_PER_QUERY): string[][] {
  const out: string[][] = []
  for (let i = 0; i < tags.length; i += size) out.push(tags.slice(i, i + size))
  return out
}

/** `1992–2017` (or `2005` for a single year). */
export function yearRange(model: { from: number; to: number }): string {
  return model.from === model.to ? `${model.from}` : `${model.from}–${model.to}`
}

/** Years as consecutive runs: `[2017, 2016, 2014, 1992]` → `1992, 2014, 2016–2017`. */
export function yearRuns(years: readonly number[]): string {
  const asc = [...years].sort((a, b) => a - b)
  const runs: string[] = []
  let start = asc[0]
  let prev = asc[0]
  for (const y of asc.slice(1)) {
    if (y === (prev ?? 0) + 1) {
      prev = y
      continue
    }
    runs.push(start === prev ? `${start}` : `${start}–${prev}`)
    start = prev = y
  }
  if (start !== undefined) runs.push(start === prev ? `${start}` : `${start}–${prev}`)
  return runs.join(', ')
}

/** Sitemap paths: the index, every make and every model. Years are found by links and only indexed when they have parts. */
export function vehicleSitemapPaths(catalog: VehicleCatalog, paths: { index: string; make: (make: string) => string; model: (make: string, model: string) => string }): string[] {
  const makes = listedMakes(catalog)
  return [paths.index, ...makes.map((m) => paths.make(m.id)), ...makes.flatMap((m) => m.models.map((mo) => paths.model(m.id, mo.id)))]
}

/** The catalog make a tag name stands for: the alias target when `makeAliases` maps it (`gm` → `chevrolet`), else itself. */
function canonicalMake(id: string, config: FitmentConfig): string {
  const hit = Object.entries(config.makeAliases ?? {}).find(([alias]) => alias.toLowerCase() === id)
  return hit ? hit[1].toLowerCase() : id
}

export type FitGroup = { make: VehicleMake; model: VehicleModel; years: number[] }

/**
 * Vehicles a part fits according to the backend (`<prefix>make/model/year/engine` tags), grouped by model and resolved
 * against the catalog (make aliases included). Whatever the catalog does not have is ignored. Years newest first; the
 * models with most years first. Use it to link a product to the per-vehicle pages.
 */
export function fitGroupsFromTags(catalog: VehicleCatalog, tags: readonly string[], config: FitmentConfig = DEFAULT_FITMENT_CONFIG): FitGroup[] {
  const prefix = config.tagPrefix.toLowerCase()
  const groups = new Map<string, FitGroup>()
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase()
    if (!tag.startsWith(prefix)) continue
    const [makeId, modelId, yearText] = tag.slice(prefix.length).split('/')
    if (!makeId || !modelId) continue
    // The canonical make wins; the name as written is the fallback (a catalog may still have the alias as its own make).
    const make = findMake(catalog, canonicalMake(makeId, config)) ?? findMake(catalog, makeId)
    const model = findModel(make, modelId)
    const year = model ? parseYear(model, yearText) : null
    if (!make || !model || year == null) continue
    const key = `${make.id}/${model.id}`
    const group = groups.get(key) ?? { make, model, years: [] }
    if (!group.years.includes(year)) group.years.push(year)
    groups.set(key, group)
  }
  return [...groups.values()].map((g) => ({ ...g, years: g.years.sort((a, b) => b - a) })).sort((a, b) => b.years.length - a.years.length || a.model.label.localeCompare(b.model.label))
}

/** A model link with only what it takes to draw it: it is serialized to the page, so it carries no catalog. */
export type FitLink = { makeId: string; makeLabel: string; modelId: string; modelLabel: string; from: number; to: number; years: number[] }

/** `fitGroupsFromTags` in a minimal, bounded shape (`maxModels` models, `maxYears` years each) for a product page. */
export function fitLinksFromTags(catalog: VehicleCatalog, tags: readonly string[], options: { config?: FitmentConfig; maxModels?: number; maxYears?: number } = {}): FitLink[] {
  const { config = DEFAULT_FITMENT_CONFIG, maxModels = 6, maxYears = 8 } = options
  return fitGroupsFromTags(catalog, tags, config)
    .slice(0, maxModels)
    .map((g) => ({ makeId: g.make.id, makeLabel: g.make.label, modelId: g.model.id, modelLabel: g.model.label, from: g.model.from, to: g.model.to, years: g.years.slice(0, maxYears) }))
}

type ListClient = { products: { list(params?: ProductListParams): Promise<ProductConnection> } }

export type YearProductsOptions<T extends Product = Product> = {
  /** Parallel queries (each one takes up to `TAGS_PER_QUERY` tags). Default 3. */
  maxQueries?: number
  /** Products per query. Default 24. */
  perQuery?: number
  /** Cap of the merged list. Default 48. */
  maxProducts?: number
  /** Drops products (e.g. internal or test ones). */
  keep?: (product: Product) => boolean
  /** Maps each product before it is returned (e.g. `withFit` to strip the hundreds of fit tags). */
  map?: (product: Product) => T
}

/**
 * Parts of one year of a vehicle: those the backend marks with the fit tags of its engines (`tags_any`), first page of
 * each group of tags, not paged. A failing group is skipped; if all fail, the first error is thrown.
 */
export async function loadYearProducts<T extends Product = Product>(client: ListClient, tags: readonly string[], options: YearProductsOptions<T> = {}): Promise<T[]> {
  const { maxQueries = 3, perQuery = 24, maxProducts = 48, keep, map } = options
  const groups = chunkTags(tags).slice(0, maxQueries)
  if (groups.length === 0) return []
  const results = await Promise.allSettled(groups.map((g) => client.products.list({ first: perQuery, tags_any: g })))
  const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  if (ok.length === 0) throw (results[0] as PromiseRejectedResult).reason
  const seen = new Set<string>()
  const merged: T[] = []
  for (const page of ok) {
    for (const p of page.nodes) {
      if (seen.has(p.id) || (keep && !keep(p))) continue
      seen.add(p.id)
      merged.push(map ? map(p) : (p as T))
    }
  }
  return merged.slice(0, maxProducts)
}
