import { describe, expect, it } from 'vitest'
import { createStorefrontClient, type TagFacets } from '@asteby/storefront'
import { createMockStorefront } from '@asteby/storefront/mock'
import { catalogFromFacets, FacetCatalogLimitError } from './facets.js'
import { engineOptions, makeOptions, modelOptions, resolveVehicle, yearOptions } from './fitment.js'

const TAGS = [
  ['fit:volkswagen/jetta/2018/2.0-turbo', 'fit:volkswagen/jetta/2019/2.0-turbo', 'fit:volkswagen/jetta/2021/2.0-turbo', 'fit:volkswagen/jetta/2018/1.4-turbo'],
  ['fit:gm/aveo/2010/1.6', 'fit:gm/aveo/2011/1.6'],
  ['fit:chevrolet/aveo/2012/1.6', 'fit:chevrolet/spark/2015/1.2'],
  ['fit:chevrolet/aveo/2013/1.5', 'fit:universal', 'fit:audi/a3/sedan/1.8', 'fit:audi/a4/2010'],
]

/** Fake endpoint over a tag list (same answer as the mock): records the paths asked for. */
function mockSource(tags = TAGS) {
  const seed = createMockStorefront()
  const products = seed.state.products.slice(0, tags.length).map((p, i) => ({ ...p, tags: tags[i]! }))
  const memberships = Object.fromEntries(products.map((p) => [p.handle, seed.state.memberships[p.handle] ?? []]))
  const mock = createMockStorefront({ products, memberships })
  const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
  const paths: string[] = []
  const fetcher = (path: string[]) => {
    paths.push(path.join('/'))
    return sf.catalog.tagFacets({ path })
  }
  return { sf, fetcher, paths }
}

describe('catalogFromFacets', () => {
  it('builds the selector catalog from the tags: alphabetical makes, models, engines with their year runs', async () => {
    const { sf } = mockSource()
    const catalog = await catalogFromFacets(sf)
    expect(catalog.makes.map((m) => m.id)).toEqual(['chevrolet', 'gm', 'volkswagen'])
    const jetta = catalog.makes[2]!.models[0]!
    expect(jetta).toEqual({
      id: 'jetta',
      label: 'JETTA',
      from: 2018,
      to: 2021,
      engines: [
        { id: '1.4-turbo', label: '1.4 TURBO', from: 2018, to: 2018, ranges: [[2018, 2018]] },
        { id: '2.0-turbo', label: '2.0 TURBO', from: 2018, to: 2021, ranges: [[2018, 2019], [2021, 2021]] },
      ],
    })
    // The same functions the selector already uses read it as they read the page catalog.
    expect(makeOptions(catalog).map((o) => o.value)).toEqual(['chevrolet', 'gm', 'volkswagen'])
    expect(yearOptions(catalog, { make: 'volkswagen', model: '' }).map((o) => o.value)).toEqual(['2021', '2019', '2018'])
    expect(resolveVehicle(catalog, 'volkswagen/jetta/2020/2.0-turbo')).toBeNull()
    expect(resolveVehicle(catalog, 'volkswagen/jetta/2021/2.0-turbo')?.engine.label).toBe('2.0 TURBO')
  })

  it('folds alias makes into the canonical one (gm → chevrolet), merging the shared models', async () => {
    const { fetcher } = mockSource()
    const catalog = await catalogFromFacets(fetcher, { aliases: { gm: 'chevrolet' } })
    expect(catalog.makes.map((m) => m.id)).toEqual(['chevrolet', 'volkswagen'])
    const chevrolet = catalog.makes[0]!
    expect(chevrolet.models.map((m) => m.id)).toEqual(['aveo', 'spark'])
    expect(chevrolet.models[0]).toMatchObject({ from: 2010, to: 2013 })
    expect(engineOptions(catalog, { make: 'chevrolet', model: 'aveo', year: '2010' })).toEqual([{ value: '1.6', label: '1.6' }])
    expect(resolveVehicle(catalog, 'chevrolet/aveo/2011/1.6')?.key).toBe('chevrolet/aveo/2011/1.6')
    expect(resolveVehicle(catalog, 'gm/aveo/2011/1.6')).toBeNull()
  })

  it('takes labels from the caller and sorts by them; skips tags without a year or an engine', async () => {
    const { fetcher, paths } = mockSource()
    const names: Record<string, string> = { chevrolet: 'Chevrolet', volkswagen: 'Volkswagen', gm: 'Zz GM' }
    const catalog = await catalogFromFacets(fetcher, { labels: { make: (id) => names[id], model: (_, id) => (id === 'spark' ? 'Spark' : undefined) } })
    expect(catalog.makes.map((m) => m.label)).toEqual(['Chevrolet', 'Volkswagen', 'Zz GM'])
    expect(modelOptions(catalog, { make: 'chevrolet', year: '' }).map((o) => o.label)).toEqual(['AVEO', 'Spark'])
    expect(catalog.makes.some((m) => m.id === 'audi')).toBe(false) // a3/sedan (no year) and a4/2010 (no engine)
    expect(paths).not.toContain('audi/a3/sedan')
    expect(paths).toContain('audi/a4/2010')
  })

  it('stops at maxRequests and lets the first failure reject the build', async () => {
    const { fetcher } = mockSource()
    await expect(catalogFromFacets(fetcher, { maxRequests: 3 })).rejects.toBeInstanceOf(FacetCatalogLimitError)
    const failing = async (path: string[]): Promise<TagFacets> => {
      if (path.length === 2) throw new Error('boom')
      return fetcher(path)
    }
    await expect(catalogFromFacets(failing)).rejects.toThrow('boom')
  })

  it('never has more requests in flight than `concurrency`', async () => {
    const { fetcher } = mockSource()
    let inFlight = 0
    let peak = 0
    const slow = async (path: string[]) => {
      peak = Math.max(peak, ++inFlight)
      await new Promise((r) => setTimeout(r, 2))
      try {
        return await fetcher(path)
      } finally {
        inFlight--
      }
    }
    await catalogFromFacets(slow, { concurrency: 2 })
    expect(peak).toBe(2)
  })

  it('an empty catalog (no fit tags) is an empty list of makes', async () => {
    const { sf } = mockSource([['oferta'], ['fit:universal']])
    expect(await catalogFromFacets(sf)).toEqual({ makes: [] })
  })
})
