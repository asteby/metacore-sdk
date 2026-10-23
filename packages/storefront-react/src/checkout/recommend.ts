/**
 * Which carrier rates to show first. Pure: no DOM, no amounts computed (costs are only compared, as the server sends
 * them). A long quote (10+ services, several per carrier) becomes up to three recommended rows (the cheapest, the
 * fastest and the best balance of both) plus the rest grouped by carrier, so the buyer compares three things instead of
 * scanning a flat list.
 */
import type { ShippingRate } from '@asteby/storefront'
import { brandKey } from './brands.js'

/** Why a rate is recommended. `best_value` balances price and arrival time. */
export type RateTag = 'cheapest' | 'fastest' | 'best_value'

export type RecommendedRate<R extends ShippingRate = ShippingRate> = { rate: R; tags: RateTag[] }

export type RateGroup<R extends ShippingRate = ShippingRate> = {
  /** Brand key of the carrier (`fedex`), or `''` for rates without one. */
  key: string
  /** Carrier as the server sends it (first rate of the group), for `BrandMark` and the group name. */
  carrier: string | null
  rates: R[]
}

export type RecommendRatesOptions = {
  /** How many rates to recommend. Default 3. */
  count?: number
  /**
   * With this many rates or fewer every rate is recommended (no "more options"): hiding one or two rates behind a
   * toggle costs more than it saves. Default `count + 1`.
   */
  collapseAfter?: number
  /** Drop repeated services (same carrier and service, e.g. quoted by two providers), keeping the cheapest. Default true. */
  dedupe?: boolean
}

export type RecommendedRates<R extends ShippingRate = ShippingRate> = {
  recommended: RecommendedRate<R>[]
  /** Everything else, grouped by carrier; groups ordered by their cheapest rate, rates by cost. */
  more: RateGroup<R>[]
  /** Number of rates in `more`. */
  moreCount: number
}

const costOf = (r: ShippingRate) => {
  const n = Number(r.cost.amount)
  return Number.isFinite(n) ? n : null
}
const daysOf = (r: ShippingRate) => r.eta_days_max ?? r.eta_days_min ?? null
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
const carrierKey = (r: ShippingRate) => (r.carrier ? brandKey(r.carrier) : r.provider ? brandKey(r.provider) : '')

/** Repeated services (same carrier, same service code or title, same arrival): only the cheapest stays. Order kept. */
export function dedupeRates<R extends ShippingRate>(rates: readonly R[]): R[] {
  const best = new Map<string, R>()
  const keyOf = (r: R) => `${carrierKey(r)}|${norm(r.service_code) || norm(r.title)}|${daysOf(r) ?? ''}|${r.cost.currency_code}`
  for (const r of rates) {
    const k = keyOf(r)
    const prev = best.get(k)
    const c = costOf(r)
    if (!prev || (c !== null && (costOf(prev) === null || c < costOf(prev)!))) best.set(k, r)
  }
  const keep = new Set(best.values())
  return rates.filter((r) => keep.has(r))
}

/**
 * Up to `count` recommended rates and the rest by carrier.
 * - **cheapest**: lowest cost (only when every rate shares the currency); a tie goes to the faster one.
 * - **fastest**: fewest business days; a tie goes to the cheaper one. Only when some rate is strictly faster than the
 *   cheapest, so the tag always tells the buyer something.
 * - **best_value**: the remaining rate with the best combined position in price and in time (sum of ranks), a tie goes
 *   to the cheaper one. Fills the remaining slots.
 * Recommended rows come back cheapest first. Pickup is not a rate and is never hidden (the component shows it apart).
 */
export function recommendRates<R extends ShippingRate>(input: readonly R[], options: RecommendRatesOptions = {}): RecommendedRates<R> {
  const count = Math.max(1, options.count ?? 3)
  const rates = options.dedupe === false ? [...input] : dedupeRates(input)
  const collapseAfter = options.collapseAfter ?? count + 1
  const sameCurrency = new Set(rates.map((r) => r.cost.currency_code)).size <= 1
  const byCost = (a: R, b: R) => (costOf(a) ?? Infinity) - (costOf(b) ?? Infinity)
  const byDays = (a: R, b: R) => (daysOf(a) ?? Infinity) - (daysOf(b) ?? Infinity)
  const tags = new Map<R, RateTag[]>()
  const tag = (r: R, t: RateTag) => tags.set(r, [...(tags.get(r) ?? []), t])

  const cheapest = sameCurrency && rates.length > 1 ? [...rates].sort((a, b) => byCost(a, b) || byDays(a, b))[0] : undefined
  if (cheapest && costOf(cheapest) !== null) tag(cheapest, 'cheapest')
  const fastest = rates.length > 1 ? [...rates].sort((a, b) => byDays(a, b) || byCost(a, b))[0] : undefined
  if (fastest && daysOf(fastest) !== null && (!cheapest || fastest === cheapest || (daysOf(cheapest) ?? Infinity) > daysOf(fastest)!)) tag(fastest, 'fastest')

  const chosen: R[] = []
  for (const r of [cheapest, fastest]) if (r && tags.has(r) && !chosen.includes(r)) chosen.push(r)

  if (rates.length > collapseAfter) {
    // Rank in price and in time (ties share a rank); the best sum fills the remaining slots.
    const rank = (sorted: R[], val: (r: R) => number | null) => {
      const out = new Map<R, number>()
      let pos = 0
      let last: number | null | undefined
      sorted.forEach((r, i) => {
        const v = val(r)
        if (v !== last) pos = i
        last = v
        out.set(r, v === null ? sorted.length : pos)
      })
      return out
    }
    const priceRank = rank([...rates].sort(byCost), costOf)
    const timeRank = rank([...rates].sort(byDays), daysOf)
    const rest = rates
      .filter((r) => !chosen.includes(r))
      .sort((a, b) => priceRank.get(a)! + timeRank.get(a)! - (priceRank.get(b)! + timeRank.get(b)!) || byCost(a, b))
    let first = true
    for (const r of rest) {
      if (chosen.length >= count) break
      chosen.push(r)
      if (first) tag(r, 'best_value')
      first = false
    }
  } else {
    for (const r of rates) if (!chosen.includes(r)) chosen.push(r)
  }

  const recommended = chosen.sort(byCost).map((rate) => ({ rate, tags: tags.get(rate) ?? [] }))
  const groups = new Map<string, RateGroup<R>>()
  for (const r of [...rates].sort(byCost)) {
    if (chosen.includes(r)) continue
    const key = carrierKey(r)
    const g = groups.get(key) ?? { key, carrier: r.carrier ?? r.provider ?? null, rates: [] }
    g.rates.push(r)
    groups.set(key, g)
  }
  const more = [...groups.values()]
  return { recommended, more, moreCount: more.reduce((n, g) => n + g.rates.length, 0) }
}
