import { describe, expect, it } from 'vitest'
import { createStorefrontClient, StorefrontError } from '../index.js'
import { createMockStorefront } from './index.js'
import { tagFacetsFromTags } from './tag-facets.js'

const TAGS: string[][] = [
  ['fit:ford/f-150/2018/5.0', 'fit:ford/f-150/2019/5.0', 'fit:ford/f-150/2021/3.5-ecoboost', 'oferta'],
  ['fit:ford/f-150/2018/2.7', 'fit:nissan/versa/2016/1.6'],
  ['fit:universal'],
  ['FIT:Nissan/Versa/2017/1.6 ', 'fit:citroën/c3/2015/1.2', 'fit:ford/f 150/2018/5.0', 'fit:nissan//2018'],
  ['fit:gm/aveo/2010/1.6'],
]

function mockWith(tags: string[][], opts: Parameters<typeof createMockStorefront>[0] = {}) {
  const seed = createMockStorefront()
  const products = seed.state.products.slice(0, tags.length).map((p, i) => ({ ...p, tags: tags[i]! }))
  const memberships = Object.fromEntries(products.map((p) => [p.handle, seed.state.memberships[p.handle] ?? []]))
  const mock = createMockStorefront({ ...opts, products, memberships })
  return { mock, sf: createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch }) }
}

describe('tag facets (contract 1.24)', () => {
  it('first level: the makes with their product counts; universal and bad slugs are not counted', () => {
    const res = tagFacetsFromTags(TAGS, { prefix: 'fit:', path: [] })
    expect(res).toEqual({
      prefix: 'fit:',
      path: [],
      level: 0,
      count: 4,
      options: [
        { id: 'ford', count: 2 },
        { id: 'gm', count: 1 },
        { id: 'nissan', count: 2 },
      ],
    })
  })

  it('a year level comes sorted by year and folded into runs', () => {
    const res = tagFacetsFromTags(TAGS, { prefix: 'fit:', path: ['ford', 'f-150'] })
    expect(res.options).toEqual([
      { id: '2018', count: 2 },
      { id: '2019', count: 1 },
      { id: '2021', count: 1 },
    ])
    expect(res.years).toEqual([
      [2018, 2019],
      [2021, 2021],
    ])
    expect(res.count).toBe(2)
  })

  it('a whole key validates: count 0 means no part', () => {
    expect(tagFacetsFromTags(TAGS, { prefix: 'fit:', path: ['ford', 'f-150', '2018', '5.0'] })).toMatchObject({ count: 1, options: [] })
    expect(tagFacetsFromTags(TAGS, { prefix: 'fit:', path: ['ford', 'f-150', '2020', '5.0'] })).toMatchObject({ count: 0, options: [] })
  })

  it('the client asks the mock one level at a time', async () => {
    const { sf } = mockWith(TAGS)
    expect((await sf.catalog.tagFacets()).options.map((o) => o.id)).toEqual(['ford', 'gm', 'nissan'])
    expect((await sf.catalog.tagFacets({ path: ['nissan'] })).options).toEqual([{ id: 'versa', count: 2 }])
    expect((await sf.catalog.tagFacets({ path: 'nissan/versa' })).years).toEqual([[2016, 2017]])
    expect((await sf.catalog.tagFacets({ key: 'fit:nissan/versa/2017/1.6' })).count).toBe(1)
  })

  it('rejects what the server rejects: another prefix, bad segments, key with path', async () => {
    const { sf } = mockWith(TAGS)
    const fails = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e)
    expect(await fails(sf.catalog.tagFacets({ prefix: 'size:' }))).toMatchObject({ status: 400, code: 'validation', field: 'prefix' })
    expect(await fails(sf.catalog.tagFacets({ path: ['ford', 'f 150'] }))).toMatchObject({ status: 400, field: 'path' })
    expect(await fails(sf.catalog.tagFacets({ path: 'a/b/c/d/e/f' }))).toMatchObject({ status: 400, field: 'path' })
    const both = await fails(sf.catalog.tagFacets({ key: 'fit:ford', path: ['ford'] }))
    expect(both).toBeInstanceOf(TypeError)
    expect(both).not.toBeInstanceOf(StorefrontError)
  })

  it('serves the prefixes the shop enables (facetPrefixes)', async () => {
    const { sf } = mockWith([['size:205/55/16'], ['size:205/60/16']], { facetPrefixes: ['size:'] })
    expect(await sf.catalog.tagFacets()).toMatchObject({ prefix: 'size:', options: [{ id: '205', count: 2 }] })
    expect((await sf.catalog.tagFacets({ path: ['205'] })).options).toEqual([
      { id: '55', count: 1 },
      { id: '60', count: 1 },
    ])
  })

  it('is a public, cacheable answer', async () => {
    const { mock } = mockWith(TAGS)
    const res = await mock.fetch('https://mock.local/api/gw/storefront/tag-facets?path=ford', { headers: { Authorization: 'Bearer sk_mock' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toMatch(/^public/)
    expect(res.headers.get('etag')).toBeTruthy()
  })
})
