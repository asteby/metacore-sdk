// The vehicle catalog built from the products' own tags (`GET /storefront/tag-facets`, contract 1.24) instead of a
// hand-kept content page that goes stale. The answer has the same shape `parseCatalog` gives, so the selector
// (makeOptions, yearOptions, resolveVehicle...) does not change.
//
// The endpoint answers ONE level per call, so the whole tree costs one request per make, per model and per model-year
// (`1 + makes + models + model-years`). With thousands of model-years that is thousands of requests: build it in the
// background, cache it for minutes (never per page view) and keep `maxRequests` as a guard.

import type { TagFacets } from '@asteby/storefront'
import { labelFromId, type VehicleCatalog, type VehicleEngine, type VehicleMake, type VehicleModel } from './fitment.js'

/** One level of the tags under `path` (the segments already fixed). */
export type TagFacetsFetcher = (path: string[]) => Promise<TagFacets>

/** A storefront client (`sf`) or anything with its `catalog.tagFacets`. */
export type TagFacetsSource = TagFacetsFetcher | { catalog: { tagFacets(params: { prefix?: string; path?: readonly string[] }): Promise<TagFacets> } }

export type FacetCatalogOptions = {
  /** Tag prefix asked for (default: the shop's default one, `fit:`). */
  prefix?: string
  /**
   * Makes whose tags use another name than the selector (`{ gm: 'chevrolet' }`): their models are folded into the
   * canonical make, so the key the buyer picks is always the canonical one (the listing must accept the alias tags).
   */
  aliases?: Readonly<Record<string, string>>
  /** Display labels; `undefined` falls back to the id (`labelFromId`). */
  labels?: {
    make?: (makeId: string) => string | undefined
    model?: (makeId: string, modelId: string) => string | undefined
    engine?: (makeId: string, modelId: string, engineId: string) => string | undefined
  }
  /** Locale of the alphabetical order of makes and models (default `es`). */
  locale?: string
  /** Requests in flight at once (default 4). */
  concurrency?: number
  /** Upper bound of requests; reaching it rejects with `FacetCatalogLimitError` (default 10 000). */
  maxRequests?: number
  signal?: AbortSignal
}

/** The catalog needed more requests than `maxRequests`. */
export class FacetCatalogLimitError extends RangeError {
  constructor(readonly maxRequests: number) {
    super(`catalogFromFacets: more than ${maxRequests} requests`)
    this.name = 'FacetCatalogLimitError'
  }
}

const YEAR = /^\d{4}$/

/** Year list → [from, to] runs of consecutive years. */
function runs(years: Iterable<number>): [number, number][] {
  const out: [number, number][] = []
  for (const y of [...new Set(years)].sort((a, b) => a - b)) {
    const last = out[out.length - 1]
    if (last && last[1] + 1 === y) last[1] = y
    else out.push([y, y])
  }
  return out
}

/**
 * Walks the `fit:<make>/<model>/<year>/<engine>` tags of the visible catalog level by level and returns the vehicle
 * catalog: makes and models in alphabetical order (by label), engines with the year runs in which they have parts.
 * Makes named by an alias are folded into the canonical one. Tags of another shape (a third segment that is not a
 * year, no engine) are skipped. A failed request rejects the whole build: the caller keeps its previous catalog.
 */
export async function catalogFromFacets(source: TagFacetsSource, opts: FacetCatalogOptions = {}): Promise<VehicleCatalog> {
  const fetchLevel: TagFacetsFetcher =
    typeof source === 'function'
      ? source
      : (path) => source.catalog.tagFacets({ ...(opts.prefix ? { prefix: opts.prefix } : {}), ...(path.length ? { path } : {}) })
  const aliases = opts.aliases ?? {}
  const limit = opts.maxRequests ?? 10_000
  const concurrency = Math.max(1, opts.concurrency ?? 4)
  let requests = 0
  const level = async (path: string[]): Promise<string[]> => {
    opts.signal?.throwIfAborted()
    if (++requests > limit) throw new FacetCatalogLimitError(limit)
    return (await fetchLevel(path)).options.map((o) => o.id)
  }

  // Runs `jobs` with at most `concurrency` in flight; the first failure rejects.
  async function pool<T>(items: T[], job: (item: T) => Promise<void>): Promise<void> {
    let next = 0
    const worker = async () => {
      while (next < items.length) await job(items[next++] as T)
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  }

  // canonical make → model → engine → years
  const tree = new Map<string, Map<string, Map<string, Set<number>>>>()
  const makes = await level([])
  const models: [string, string][] = []
  await pool(makes, async (make) => {
    for (const model of await level([make])) models.push([make, model])
  })
  const modelYears: [string, string, string][] = []
  await pool(models, async ([make, model]) => {
    for (const year of await level([make, model])) if (YEAR.test(year)) modelYears.push([make, model, year])
  })
  await pool(modelYears, async ([make, model, year]) => {
    const engines = await level([make, model, year])
    if (!engines.length) return
    const canonical = aliases[make] ?? make
    const byModel = tree.get(canonical) ?? new Map<string, Map<string, Set<number>>>()
    tree.set(canonical, byModel)
    const byEngine = byModel.get(model) ?? new Map<string, Set<number>>()
    byModel.set(model, byEngine)
    for (const engine of engines) {
      const years = byEngine.get(engine) ?? new Set<number>()
      years.add(Number(year))
      byEngine.set(engine, years)
    }
  })

  const collator = new Intl.Collator(opts.locale ?? 'es', { sensitivity: 'base', numeric: true })
  const byLabel = (a: { id: string; label: string }, b: { id: string; label: string }) => collator.compare(a.label, b.label) || (a.id < b.id ? -1 : 1)
  const out: VehicleMake[] = []
  for (const [makeId, byModel] of tree) {
    const modelList: VehicleModel[] = []
    for (const [modelId, byEngine] of byModel) {
      const engines: VehicleEngine[] = [...byEngine]
        .sort(([a], [b]) => collator.compare(a, b))
        .map(([engineId, years]) => {
          const ranges = runs(years)
          return {
            id: engineId,
            label: opts.labels?.engine?.(makeId, modelId, engineId) ?? labelFromId(engineId),
            from: ranges[0]![0],
            to: ranges[ranges.length - 1]![1],
            ranges,
          }
        })
      modelList.push({
        id: modelId,
        label: opts.labels?.model?.(makeId, modelId) ?? labelFromId(modelId),
        from: Math.min(...engines.map((e) => e.from!)),
        to: Math.max(...engines.map((e) => e.to!)),
        engines,
      })
    }
    out.push({ id: makeId, label: opts.labels?.make?.(makeId) ?? labelFromId(makeId), models: modelList.sort(byLabel) })
  }
  return { makes: out.sort(byLabel) }
}
