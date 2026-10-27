/**
 * Postal-code lookup as pluggable providers (no React, no browser: it runs in the shop's server route).
 *
 * `createPostalLookup({ providers: [catalog, osm] })` returns the `(zip) => Promise<PostalCodeInfo | null>` that
 * `AddressFields` expects: the providers are tried IN ORDER, the first that answers wins and the rest are never called,
 * every answer carries `source` (the provider's name), and results are cached per code. Nothing here knows a country:
 * the catalog of a country, the format of its codes and its list of official states come from the shop.
 */

/** What a postal-code lookup answers (same shape as `PostalCodeInfo` of `@asteby/storefront-react/checkout`). */
export type PostalInfo = {
  province?: string | null
  city?: string | null
  neighborhoods?: readonly string[] | null
  /** Every municipality the code covers, when more than one (the buyer chooses; nothing is locked). */
  cities?: readonly string[] | null
  municipality?: string | null
  /** Name of the provider that answered (`catalog`, `osm`, ...). */
  source?: string | null
}

export type PostalProvider = {
  /** Shown in `source`. */
  name: string
  /** `null` when this provider answered and does not know the code. Throwing (timeout, outage) means "could not ask": the next provider is tried and a null result is not remembered for long. */
  lookup: (zip: string, ctx: { signal?: AbortSignal }) => Promise<PostalInfo | null> | PostalInfo | null
}

/** A provider over a local catalog of one country (sync or async getter; deterministic, no network). */
export function createCatalogProvider(opts: { name?: string; get: (zip: string) => PostalInfo | null | Promise<PostalInfo | null> }): PostalProvider {
  return { name: opts.name ?? 'catalog', lookup: (zip) => opts.get(zip) }
}

/**
 * Provider over the Storefront API (`GET /storefront/region/postal-code`, the region pack's full catalog): the one a
 * shop uses. Pass the shop's client (`storefront`, server side with an `sk_` token, or the browser one with `pk_`).
 * `null` when the code is not in the catalog; a failure throws ("could not ask").
 */
export function createStorefrontPostalProvider(client: { postalCode: (zip: string) => Promise<PostalInfo | null> }, name = 'region'): PostalProvider {
  return { name, lookup: (zip) => client.postalCode(zip) }
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

export type OsmProviderOptions = {
  /** Base URL of a Nominatim-compatible `/search` (self-hosted, or the public one). No trailing slash needed. */
  baseUrl: string
  /** ISO 3166-1 alpha-2 of the shop's country. Results of any other country are discarded. */
  country: string
  /** Identifying `User-Agent` (the public Nominatim requires one with a contact). */
  userAgent: string
  /**
   * Official states of the country. The state OSM answers must be one of them (accent and case insensitive, or one of
   * `stateAliases`); the OFFICIAL spelling is what is returned. Without the list the state is not validated.
   */
  states?: readonly string[]
  /** Other names OSM uses for an official state (`{ 'Estado de México': 'México' }`). */
  stateAliases?: Readonly<Record<string, string>>
  /** Format of the country's codes; anything else is not sent. */
  zipPattern?: RegExp
  /** Short on purpose: a slow geocoder must never slow the checkout. Default 800 ms. */
  timeoutMs?: number
  /** Minimum gap between requests (the public Nominatim allows 1 per second). Default 1000 ms. */
  minIntervalMs?: number
  /** Header `Accept-Language`. Default `es`. */
  language?: string
  /** For tests / custom transports. Default global `fetch`. */
  fetch?: typeof fetch
  now?: () => number
  name?: string
}

type NominatimHit = { address?: Record<string, string | undefined> }

/**
 * @deprecated Do not wire this in storefronts: the lookup of a shop is the region pack's catalog behind the Storefront
 * API (`createStorefrontPostalProvider`). OpenStreetMap data is not authoritative for state and city, so it must never
 * lock a field.
 *
 * Fallback provider over OpenStreetMap (Nominatim). Data © OpenStreetMap contributors, ODbL: attribute it. */
export function createOsmProvider(opts: OsmProviderOptions): PostalProvider {
  const timeoutMs = opts.timeoutMs ?? 800
  const minInterval = opts.minIntervalMs ?? 1000
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  const now = opts.now ?? Date.now
  const country = opts.country.toLowerCase()
  const official = new Map<string, string>()
  for (const s of opts.states ?? []) official.set(fold(s), s)
  for (const [alias, to] of Object.entries(opts.stateAliases ?? {})) {
    const target = official.get(fold(to)) ?? (opts.states ? undefined : to)
    if (target) official.set(fold(alias), target)
  }
  const validateState = !!opts.states?.length
  // Rate limit: one request at a time, `minInterval` apart. A request that would wait longer than the timeout is
  // skipped (null): the buyer types the address instead of waiting in a queue.
  let nextSlot = 0

  return {
    name: opts.name ?? 'osm',
    async lookup(zip, ctx) {
      if (opts.zipPattern && !opts.zipPattern.test(zip)) return null
      const t = now()
      const start = Math.max(t, nextSlot)
      if (start - t > timeoutMs) throw new Error('rate-limited')
      nextSlot = start + minInterval
      if (start > t) await new Promise((r) => setTimeout(r, start - t))
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), timeoutMs)
      const onAbort = () => ctl.abort()
      ctx.signal?.addEventListener('abort', onAbort)
      try {
        const url = new URL(`${opts.baseUrl.replace(/\/+$/, '')}/search`)
        url.search = new URLSearchParams({ postalcode: zip, countrycodes: country, format: 'jsonv2', addressdetails: '1', limit: '10' }).toString()
        const res = await doFetch(url.toString(), {
          signal: ctl.signal,
          headers: { 'User-Agent': opts.userAgent, Accept: 'application/json', 'Accept-Language': opts.language ?? 'es' },
        })
        if (res.status === 404) return null
        if (!res.ok) throw new Error(`http ${res.status}`)
        const hits = (await res.json()) as unknown
        if (!Array.isArray(hits)) throw new Error('bad response')
        return fromNominatim(hits as NominatimHit[], zip, country, official, validateState)
      } finally {
        clearTimeout(timer)
        ctx.signal?.removeEventListener('abort', onAbort)
      }
    },
  }
}

function fromNominatim(hits: NominatimHit[], zip: string, country: string, official: Map<string, string>, validateState: boolean): PostalInfo | null {
  const states = new Set<string>()
  const cities = new Set<string>()
  const hoods = new Set<string>()
  for (const h of hits) {
    const a = h.address
    if (!a || a.country_code?.toLowerCase() !== country) continue
    if ((a.postcode ?? '').trim() !== zip) continue
    const state = a.state?.trim()
    if (!state) continue
    const canon = official.get(fold(state))
    if (validateState && !canon) continue
    states.add(canon ?? state)
    const city = a.municipality ?? a.county ?? a.borough ?? a.city_district ?? a.city ?? a.town ?? a.village
    if (city) cities.add(city.trim())
    for (const k of ['suburb', 'neighbourhood', 'quarter']) if (a[k]) hoods.add(a[k]!.trim())
  }
  // Ambiguous state: nothing is invented.
  if (states.size !== 1 || cities.size === 0) return null
  const list = [...cities].sort((x, y) => x.localeCompare(y))
  return {
    province: [...states][0]!,
    city: list[0]!,
    neighborhoods: [...hoods].sort((x, y) => x.localeCompare(y)),
    ...(list.length > 1 ? { cities: list } : {}),
  }
}

export type PostalLookupOptions = {
  providers: readonly PostalProvider[]
  /** Only codes of this shape are looked up; anything else answers null without touching a provider. */
  zipPattern?: RegExp
  /** How long a code answered is remembered. Default 24 h. */
  ttlMs?: number
  /** How long "nobody knows it" is remembered (shorter: a new code may appear). Default 10 min. */
  negativeTtlMs?: number
  /** Cache size. Default 5000 codes. */
  maxEntries?: number
  now?: () => number
  /** Called when a provider throws (the lookup still continues with the next one). */
  onError?: (provider: string, error: unknown) => void
}

/**
 * The `lookupPostalCode` of a shop: providers in order with fallback, per-code cache and de-duplicated in-flight
 * requests. The first provider that answers wins; later ones are never called for that code.
 */
export function createPostalLookup(opts: PostalLookupOptions): (zip: string) => Promise<PostalInfo | null> {
  const ttl = opts.ttlMs ?? 24 * 3_600_000
  const negTtl = opts.negativeTtlMs ?? 600_000
  const max = opts.maxEntries ?? 5000
  const now = opts.now ?? Date.now
  const cache = new Map<string, { at: number; ttl: number; value: PostalInfo | null }>()
  const inflight = new Map<string, Promise<PostalInfo | null>>()

  const resolve = async (zip: string): Promise<{ value: PostalInfo | null; failed: boolean }> => {
    let failed = false
    for (const p of opts.providers) {
      try {
        const info = await p.lookup(zip, {})
        if (info && (info.province || info.city)) return { value: { ...info, source: p.name }, failed }
      } catch (e) {
        failed = true
        opts.onError?.(p.name, e)
      }
    }
    return { value: null, failed }
  }

  return async (zip: string) => {
    if (opts.zipPattern && !opts.zipPattern.test(zip)) return null
    const hit = cache.get(zip)
    if (hit && now() - hit.at < hit.ttl) return hit.value
    let p = inflight.get(zip)
    if (!p) {
      p = resolve(zip)
        .then(({ value, failed }) => {
          if (cache.size >= max) cache.delete(cache.keys().next().value as string)
          // A "nobody knows" caused by an outage is remembered only briefly, so the code is asked again soon.
          cache.set(zip, { at: now(), ttl: value ? ttl : failed ? Math.min(negTtl, 30_000) : negTtl, value })
          return value
        })
        .finally(() => inflight.delete(zip))
      inflight.set(zip, p)
    }
    return p
  }
}
