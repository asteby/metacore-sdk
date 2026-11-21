import { describe, expect, it, vi } from 'vitest'
import type { Product, ProductConnection } from '@asteby/storefront'
import { fitmentConfig, parseCatalog } from './fitment.js'
import {
  chunkTags, enginesForYear, findMake, findModel, fitGroupsFromTags, fitLinksFromTags, listedMakes, loadYearProducts, modelYears, parseYear, TAGS_PER_QUERY,
  vehicleSitemapPaths, yearRange, yearRuns, yearTags,
} from './vehicle-pages.js'

const config = fitmentConfig({ makeAliases: { gm: 'chevrolet' } })
const catalog = parseCatalog({
  makes: [
    { id: 'gm', label: 'GM', models: [{ id: 'aveo', label: 'Aveo', from: 2008, to: 2011, engines: [{ id: '1-6', label: '1.6' }] }] },
    { id: 'chevrolet', label: 'Chevrolet', priority: 'HIGH', models: [{ id: 'aveo', label: 'Aveo', from: 2008, to: 2011, engines: [{ id: '1-6', label: '1.6', from: 2008, to: 2011 }, { id: '1-4', label: '1.4', from: 2010, to: 2011 }] }] },
    { id: 'nissan', label: 'Nissan', models: [{ id: 'tsuru', label: 'Tsuru', from: 1992, to: 2017, engines: [{ id: '1-6', label: '1.6', ranges: [[1992, 1995], [2000, 2017]] }] }] },
    { id: 'empty', label: 'Empty', models: [] },
  ],
})

const chevrolet = findMake(catalog, 'chevrolet')!
const aveo = findModel(chevrolet, 'aveo')!
const tsuru = findModel(findMake(catalog, 'nissan'), 'tsuru')!

describe('vehicle pages', () => {
  it('finds makes and models; ignores makes without models and unknown ids', () => {
    expect(chevrolet.label).toBe('Chevrolet')
    expect(findMake(catalog, 'empty')).toBeUndefined()
    expect(findMake(catalog, 'nope')).toBeUndefined()
    expect(findMake(catalog, undefined)).toBeUndefined()
    expect(findModel(chevrolet, 'nope')).toBeUndefined()
    expect(findModel(undefined, 'aveo')).toBeUndefined()
  })

  it('lists makes: high priority first, then by name', () => {
    expect(listedMakes(catalog).map((m) => m.id)).toEqual(['chevrolet', 'gm', 'nissan'])
  })

  it('model years: only the ones an engine covers, newest first', () => {
    expect(modelYears(aveo)).toEqual([2011, 2010, 2009, 2008])
    expect(modelYears(tsuru)).not.toContain(1998)
    expect(modelYears(tsuru)[0]).toBe(2017)
  })

  it('engines of a year', () => {
    expect(enginesForYear(aveo, 2009).map((e) => e.id)).toEqual(['1-6'])
    expect(enginesForYear(aveo, 2010).map((e) => e.id)).toEqual(['1-6', '1-4'])
  })

  it('parseYear checks format and range', () => {
    expect(parseYear(aveo, '2010')).toBe(2010)
    expect(parseYear(aveo, '2012')).toBeNull()
    expect(parseYear(aveo, '20x0')).toBeNull()
    expect(parseYear(aveo, undefined)).toBeNull()
    expect(parseYear(tsuru, '1998')).toBeNull()
  })

  it('year tags carry every make alias and never the universal tag', () => {
    expect(yearTags(chevrolet, aveo, 2010, config)).toEqual(['fit:chevrolet/aveo/2010/1-6', 'fit:gm/aveo/2010/1-6', 'fit:chevrolet/aveo/2010/1-4', 'fit:gm/aveo/2010/1-4'])
    expect(yearTags(chevrolet, aveo, 2010, config).some((t) => t.includes('universal'))).toBe(false)
  })

  it('year tags follow a custom prefix and have no aliases by default', () => {
    expect(yearTags(chevrolet, aveo, 2009, fitmentConfig({ tagPrefix: 'compat:' }))).toEqual(['compat:chevrolet/aveo/2009/1-6'])
  })

  it('chunkTags respects the per-query limit', () => {
    expect(TAGS_PER_QUERY).toBe(5)
    expect(chunkTags(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toEqual([['a', 'b', 'c', 'd', 'e'], ['f', 'g']])
    expect(chunkTags([])).toEqual([])
  })

  it('readable ranges', () => {
    expect(yearRange({ from: 2005, to: 2005 })).toBe('2005')
    expect(yearRange({ from: 1992, to: 2017 })).toBe('1992–2017')
    expect(yearRuns([2017, 2016, 2014, 1992])).toBe('1992, 2014, 2016–2017')
  })

  it('sitemap paths: index, makes and models (no empty makes, no years)', () => {
    const out = vehicleSitemapPaths(catalog, { index: '/v', make: (m) => `/v/${m}`, model: (m, mo) => `/v/${m}/${mo}` })
    expect(out).toEqual(['/v', '/v/chevrolet', '/v/gm', '/v/nissan', '/v/chevrolet/aveo', '/v/gm/aveo', '/v/nissan/tsuru'])
  })
})

describe('fitGroupsFromTags / fitLinksFromTags', () => {
  const tags = ['fit:gm/aveo/2009/1-6', 'fit:chevrolet/aveo/2011/1-6', 'fit:chevrolet/aveo/2011/1-4', 'fit:nissan/tsuru/1998/1-6', 'fit:nissan/tsuru/2001/1-6', 'fit:ford/fiesta/2010/1-6', 'fit:universal', 'brand:x', 'fit:nissan/tsuru/abcd/1-6']

  it('groups by model, resolves the alias, sorts years and drops what the catalog lacks', () => {
    const g = fitGroupsFromTags(catalog, tags, config)
    expect(g.map((x) => `${x.make.id}/${x.model.id}:${x.years.join(',')}`)).toEqual(['chevrolet/aveo:2011,2009', 'nissan/tsuru:2001'])
  })

  it('without the alias, a gm tag still resolves to the make that exists under that name', () => {
    expect(fitGroupsFromTags(catalog, ['fit:gm/aveo/2009/1-6']).map((x) => x.make.id)).toEqual(['gm'])
  })

  it('honours a custom prefix and ignores the default one', () => {
    const custom = fitmentConfig({ tagPrefix: 'compat:' })
    expect(fitGroupsFromTags(catalog, ['compat:nissan/tsuru/2001/1-6', 'fit:nissan/tsuru/2002/1-6'], custom).map((x) => x.years)).toEqual([[2001]])
  })

  it('minimal bounded shape', () => {
    const many = ['fit:chevrolet/aveo/2008/1-6', 'fit:chevrolet/aveo/2009/1-6', 'fit:chevrolet/aveo/2010/1-6', 'fit:chevrolet/aveo/2011/1-6', 'fit:nissan/tsuru/2001/1-6']
    expect(fitLinksFromTags(catalog, many, { maxModels: 1, maxYears: 2 })).toEqual([{ makeId: 'chevrolet', makeLabel: 'Chevrolet', modelId: 'aveo', modelLabel: 'Aveo', from: 2008, to: 2011, years: [2011, 2010] }])
  })
})

describe('loadYearProducts', () => {
  const product = (id: string) => ({ id, tags: [] }) as unknown as Product
  const page = (...ids: string[]) => ({ nodes: ids.map(product), page_info: { has_next_page: false, end_cursor: null } }) as unknown as ProductConnection

  it('merges the groups, dedupes, filters and maps; one query per group of tags', async () => {
    const list = vi.fn().mockResolvedValueOnce(page('a', 'b')).mockResolvedValueOnce(page('b', 'c', 'hidden'))
    const tags = Array.from({ length: 7 }, (_, i) => `fit:x/y/2000/${i}`)
    const out = await loadYearProducts({ products: { list } }, tags, { keep: (p) => p.id !== 'hidden', map: (p) => ({ ...p, mapped: true }) })
    expect(list).toHaveBeenCalledTimes(2)
    expect(list.mock.calls[0][0]).toEqual({ first: 24, tags_any: tags.slice(0, 5) })
    expect(list.mock.calls[1][0]).toEqual({ first: 24, tags_any: tags.slice(5) })
    expect(out.map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(out.every((p) => p.mapped)).toBe(true)
  })

  it('serves the rest when a group fails and throws when all fail', async () => {
    const tags = Array.from({ length: 7 }, (_, i) => `fit:x/y/2000/${i}`)
    const partial = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(page('z'))
    expect((await loadYearProducts({ products: { list: partial } }, tags)).map((p) => p.id)).toEqual(['z'])
    const dead = vi.fn().mockRejectedValue(new Error('down'))
    await expect(loadYearProducts({ products: { list: dead } }, tags)).rejects.toThrow('down')
  })

  it('no tags → no queries; caps queries and products', async () => {
    const list = vi.fn()
    expect(await loadYearProducts({ products: { list } }, [])).toEqual([])
    expect(list).not.toHaveBeenCalled()
    const many = vi.fn().mockResolvedValue(page(...Array.from({ length: 30 }, (_, i) => `p${i}`)))
    const tags = Array.from({ length: 40 }, (_, i) => `fit:x/y/2000/${i}`)
    const out = await loadYearProducts({ products: { list: many } }, tags, { maxQueries: 2, maxProducts: 10 })
    expect(many).toHaveBeenCalledTimes(2)
    expect(out).toHaveLength(10)
  })
})
