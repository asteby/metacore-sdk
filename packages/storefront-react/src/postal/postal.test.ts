import { describe, expect, it, vi } from 'vitest'
import { createCatalogProvider, createOsmProvider, createPostalLookup, type PostalProvider } from './index.js'

const STATES = ['Ciudad de México', 'México', 'Jalisco']
const hit = (over: Record<string, string> = {}) => ({
  address: { postcode: '44100', state: 'Jalisco', county: 'Guadalajara', suburb: 'Centro', country_code: 'mx', ...over },
})
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const osm = (f: typeof fetch, extra: object = {}) =>
  createOsmProvider({ baseUrl: 'https://geo.test/', country: 'MX', userAgent: 'shop/1 (a@b.c)', states: STATES, stateAliases: { 'Estado de México': 'México' }, zipPattern: /^\d{5}$/, fetch: f, minIntervalMs: 0, ...extra })

describe('catalog provider + createPostalLookup', () => {
  const catalog = createCatalogProvider({ get: (z) => (z === '06700' ? { province: 'Ciudad de México', city: 'Cuauhtémoc', neighborhoods: ['Roma Norte'] } : null) })

  it('resolves from the catalog and stamps the source', async () => {
    const lookup = createPostalLookup({ providers: [catalog] })
    expect(await lookup('06700')).toMatchObject({ province: 'Ciudad de México', city: 'Cuauhtémoc', source: 'catalog' })
    expect(await lookup('99999')).toBeNull()
  })

  it('invalid format never reaches a provider', async () => {
    const get = vi.fn(() => null)
    const lookup = createPostalLookup({ providers: [createCatalogProvider({ get })], zipPattern: /^\d{5}$/ })
    expect(await lookup('abc')).toBeNull()
    expect(get).not.toHaveBeenCalled()
  })

  it('never calls the next provider when the first resolved; falls back otherwise', async () => {
    const second = vi.fn(() => ({ province: 'Jalisco', city: 'Guadalajara' }))
    const p2: PostalProvider = { name: 'osm', lookup: second }
    const lookup = createPostalLookup({ providers: [catalog, p2] })
    expect((await lookup('06700'))?.source).toBe('catalog')
    expect(second).not.toHaveBeenCalled()
    expect((await lookup('44100'))?.source).toBe('osm')
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('a throwing provider falls through, and the miss is cached only briefly', async () => {
    let t = 0
    const boom: PostalProvider = { name: 'boom', lookup: vi.fn(() => { throw new Error('down') }) }
    const onError = vi.fn()
    const lookup = createPostalLookup({ providers: [boom], now: () => t, onError })
    expect(await lookup('44100')).toBeNull()
    await lookup('44100')
    expect(boom.lookup).toHaveBeenCalledTimes(1) // cached
    t = 31_000
    await lookup('44100')
    expect(boom.lookup).toHaveBeenCalledTimes(2) // asked again after the short ttl
    expect(onError).toHaveBeenCalled()
  })

  it('caches answers and de-duplicates concurrent lookups', async () => {
    const get = vi.fn(async () => ({ province: 'Jalisco', city: 'Guadalajara' }))
    const lookup = createPostalLookup({ providers: [createCatalogProvider({ get })] })
    await Promise.all([lookup('44100'), lookup('44100'), lookup('44100')])
    await lookup('44100')
    expect(get).toHaveBeenCalledTimes(1)
  })
})

describe('osm provider', () => {
  const ctx = {}
  it('resolves, validates and uses the official state name', async () => {
    const f = vi.fn(async () => json([hit({ postcode: '44100' })])) as unknown as typeof fetch
    const r = await osm(f).lookup('44100', ctx)
    expect(r).toEqual({ province: 'Jalisco', city: 'Guadalajara', neighborhoods: ['Centro'] })
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(String(url)).toContain('https://geo.test/search?')
    expect(String(url)).toContain('postalcode=44100')
    expect(String(url)).toContain('countrycodes=mx')
    expect((init as RequestInit).headers).toMatchObject({ 'User-Agent': 'shop/1 (a@b.c)' })
  })

  it('maps state aliases to the official name', async () => {
    const f = (async () => json([hit({ postcode: '50000', state: 'Estado de México', county: 'Toluca' })])) as unknown as typeof fetch
    expect((await osm(f).lookup('50000', ctx))?.province).toBe('México')
  })

  it('404 or empty answer is a plain null', async () => {
    expect(await osm((async () => json({}, 404)) as unknown as typeof fetch).lookup('44100', ctx)).toBeNull()
    expect(await osm((async () => json([])) as unknown as typeof fetch).lookup('44100', ctx)).toBeNull()
  })

  it('a server error or a timeout throws (could not ask)', async () => {
    await expect(osm((async () => json({}, 503)) as unknown as typeof fetch).lookup('44100', ctx)).rejects.toThrow()
    const slow = ((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal!.addEventListener('abort', () => rej(new Error('aborted'))))) as unknown as typeof fetch
    await expect(osm(slow, { timeoutMs: 20 }).lookup('44100', ctx)).rejects.toThrow()
  })

  it('discards another country, another code, or a state outside the official list', async () => {
    const run = (h: object) => osm((async () => json([h])) as unknown as typeof fetch).lookup('44100', ctx)
    expect(await run(hit({ country_code: 'us' }))).toBeNull()
    expect(await run(hit({ postcode: '44101' }))).toBeNull()
    expect(await run(hit({ state: 'Texas' }))).toBeNull()
  })

  it('does not even ask for a malformed code', async () => {
    const f = vi.fn() as unknown as typeof fetch
    expect(await osm(f).lookup('4410', ctx)).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })

  it('rate limits to one request per interval and skips instead of queueing past the timeout', async () => {
    const f = vi.fn(async () => json([hit()])) as unknown as typeof fetch
    const p = osm(f, { minIntervalMs: 60, timeoutMs: 100 })
    const t0 = Date.now()
    await p.lookup('44100', ctx)
    await p.lookup('44100', ctx)
    expect(Date.now() - t0).toBeGreaterThanOrEqual(55)
    const burst = await Promise.allSettled([p.lookup('44100', ctx), p.lookup('44100', ctx), p.lookup('44100', ctx), p.lookup('44100', ctx)])
    expect(burst.some((x) => x.status === 'rejected')).toBe(true)
  })

  it('catalog first, osm only as fallback', async () => {
    const f = vi.fn(async () => json([hit({ postcode: '44999' })])) as unknown as typeof fetch
    const catalog = createCatalogProvider({ get: (z) => (z === '06700' ? { province: 'Ciudad de México', city: 'Cuauhtémoc' } : null) })
    const lookup = createPostalLookup({ providers: [catalog, osm(f)] })
    expect((await lookup('06700'))?.source).toBe('catalog')
    expect(f).not.toHaveBeenCalled()
    expect((await lookup('44999'))?.source).toBe('osm')
    expect(f).toHaveBeenCalledTimes(1)
  })
})
