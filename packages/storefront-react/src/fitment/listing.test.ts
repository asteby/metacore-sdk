import { describe, expect, it } from 'vitest'
import type { ProductListParams } from '@asteby/storefront'
import { fitmentConfig, fitFilterTags, fitFromTable, fitStatus, makeVariants, parseRowYears, rowIsVehicle, compatRows } from './fitment.js'
import { loadCompatibleListing } from './listing.js'

const prod = (id: string, tags: string[], vendor = 'X') => ({ id, handle: id, title: id, tags, vendor, attributes: {} })

/** A client with the backend semantics: `q` text search, `tags_any` hard filter (facets and total too), paging. */
function client(catalog: ReturnType<typeof prod>[], calls: ProductListParams[] = []) {
  return {
    products: {
      list: async (params: ProductListParams = {}) => {
        calls.push(params)
        const q = (params.q ?? '').toLowerCase()
        const any = (params.tags_any ?? []).map((t) => t.toLowerCase())
        const all = catalog.filter((p) => (!q || p.title.includes(q)) && (!any.length || p.tags.some((t) => any.includes(t))))
        const first = params.first ?? 24
        const offset = Number(params.after ?? 0)
        const more = offset + first < all.length
        return { nodes: all.slice(offset, offset + first), total_count: all.length, facets: [], page_info: { has_next_page: more, end_cursor: more ? String(offset + first) : null } } as never
      },
    },
  }
}

const audi = { key: 'audi/a3/2020/1.4', make: { id: 'audi', label: 'Audi' }, model: { id: 'a3', label: 'A3' }, year: 2020, engine: { id: '1.4', label: '1.4 L' } }

describe('loadCompatibleListing', () => {
  const catalog = [...Array.from({ length: 30 }, (_, i) => prod(`balata ${i}`, ['fit:gm/captiva/2022/1.5'])), prod('bieleta', ['fit:audi/a3/2020/1.4']), prod('aceite', ['fit:universal'])]

  it('filters on the backend with tags_any and keeps its total', async () => {
    const calls: ProductListParams[] = []
    const out = await loadCompatibleListing(client(catalog, calls), {}, audi)
    expect(calls[0]!.tags_any).toEqual(['fit:audi/a3/2020/1.4', 'fit:universal'])
    expect(out.nodes.map((p) => p.id)).toEqual(['bieleta', 'aceite'])
    expect(out.total_count).toBe(2)
    expect(out.catalogTotal).toBeNull()
  })
  it('nothing fits: empty, no next page, and how many the catalog has for the same search', async () => {
    const out = await loadCompatibleListing(client(catalog), { q: 'balata' }, audi)
    expect(out.nodes).toEqual([])
    expect(out.page_info.has_next_page).toBe(false)
    expect(out.catalogTotal).toBe(30)
  })
  it('the catalog count failing does not fail the listing', async () => {
    let n = 0
    const base = client(catalog)
    const flaky = { products: { list: (p?: ProductListParams) => (n++ === 0 ? base.products.list(p) : Promise.reject(new Error('down'))) } }
    expect((await loadCompatibleListing(flaky, { q: 'balata' }, audi)).catalogTotal).toBeNull()
  })
  it('drops what the backend returned without the tags', async () => {
    const loose = { products: { list: async () => ({ nodes: catalog, total_count: 32, facets: [], page_info: { has_next_page: false, end_cursor: null } }) as never } }
    const out = await loadCompatibleListing(loose, {}, audi)
    expect(out.nodes.map((p) => p.id)).toEqual(['bieleta', 'aceite'])
    expect(out.filteredOnClient).toBe(true)
    expect(out.total_count).toBeUndefined()
  })
})

describe('make aliases', () => {
  const config = fitmentConfig({ makeAliases: { gm: 'chevrolet' } })
  it('fitFilterTags carries every equivalent make (max 5 with the universal)', () => {
    expect(fitFilterTags({ key: 'chevrolet/aveo/2010/1.6' }, config)).toEqual(['fit:chevrolet/aveo/2010/1.6', 'fit:gm/aveo/2010/1.6', 'fit:universal'])
    expect(fitFilterTags({ key: 'nissan/versa/2018/1.6' }, config)).toEqual(['fit:nissan/versa/2018/1.6', 'fit:universal'])
  })
  it('fitStatus accepts a tag with the alias', () => {
    expect(fitStatus({ tags: ['fit:gm/aveo/2010/1.6'] }, { key: 'chevrolet/aveo/2010/1.6' }, config)).toBe('fits')
    expect(fitStatus({ tags: ['fit:gm/aveo/2010/1.6'] }, { key: 'chevrolet/aveo/2010/1.6' })).toBe('no')
  })
})

describe('compatibility table when the part has no fit tags', () => {
  const config = fitmentConfig({ compatAttribute: 'compatibilidad', makeAliases: { GM: 'chevrolet', vw: 'volkswagen' } })
  const captiva = { key: 'chevrolet/captiva/2023/1.5', make: { id: 'chevrolet', label: 'Chevrolet' }, model: { id: 'captiva', label: 'Captiva' }, year: 2023, engine: { id: '1.5', label: '1.5 L' } }
  const jetta = { key: 'volkswagen/jetta/2016/2.0', make: { id: 'volkswagen', label: 'Volkswagen' }, model: { id: 'jetta', label: 'Jetta' }, year: 2016, engine: { id: '2.0', label: '2.0 L' } }
  const table = (t: string) => ({ tags: [] as string[], attributes: { compatibilidad: t } })

  it('a table that never names its make: no (never an empty answer)', () => {
    expect(fitStatus(table('GM|CAPTIVA|2022-2025||'), audi, config)).toBe('no')
  })
  it('a row with its make (alias, any case), model, years and no note: fits', () => {
    expect(fitStatus(table('GM|CAPTIVA|2022-2025||'), captiva, config)).toBe('fits')
    expect(fitStatus(table('GM|CAPTIVA|2022-2025|1.5 L4|'), captiva, config)).toBe('fits')
    expect(fitStatus(table('GM|CAPTIVA|2022-2025|1.5L|'), captiva, config)).toBe('fits')
    expect(fitStatus(table('VW|JETTA|2015-2018||'), jetta, config)).toBe('fits')
    expect(rowIsVehicle(compatRows(table('GM|CAPTIVA|2022-2025||'), config)[0]!, captiva, config)).toBe(true)
  })
  it('never a false fit: engine qualifiers the vehicle lacks, or a note', () => {
    expect(fitStatus(table('GM|CAPTIVA|2022-2025|1.5 TURBO|'), captiva, config)).toBe('unknown')
    expect(fitStatus(table('VW|JETTA|2015-2018|2.0 TURBO|'), jetta, config)).toBe('unknown')
    expect(fitStatus(table('VW|JETTA|2015-2018|1.9 TDI|'), { ...jetta, engine: { id: '1.9', label: '1.9 L' } }, config)).toBe('unknown')
    expect(fitStatus(table('GM|CAPTIVA|2022-2025||premier only'), captiva, config)).toBe('unknown')
  })
  it('never a false fit: cylinders-only cells or other cylinders; most qualified vehicle engine', () => {
    expect(fitStatus(table('GM|CAPTIVA|2022-2025|V6|'), captiva, config)).toBe('unknown')
    expect(fitStatus(table('GM|CAPTIVA|2022-2025|L4|'), captiva, config)).toBe('unknown')
    const v8 = { ...captiva, engine: { id: '3.5-v8', label: '3.5 V8' } }
    expect(fitStatus(table('GM|CAPTIVA|2022-2025|3.5 V6|'), v8, config)).toBe('unknown')
    expect(fitStatus(table('GM|CAPTIVA|2022-2025|3.5 V8|'), v8, config)).toBe('fits')
    expect(fitStatus(table('GM|CAPTIVA|2022-2025|-|'), captiva, config)).toBe('fits')
    expect(fitStatus(table('GM|CAPTIVA|2022-2025| / |'), captiva, config)).toBe('unknown')
    expect(fitStatus(table('GM|CAPTIVA|2022-2025|1.5|'), { ...captiva, engine: { id: '1.5', label: '1.5 TURBO' } }, config)).toBe('unknown')
    expect(fitStatus(table('GM|CAPTIVA|2022-2025|2.5 DIESEL|'), { ...captiva, engine: { id: '2.5d', label: '2.5 L diésel' } }, config)).toBe('fits')
  })
  it('clearly other engine or years: no', () => {
    expect(fitFromTable(compatRows(table('GM|CAPTIVA|2022-2025|2.4 L4|'), config), captiva, config)).toBe('no')
    expect(fitStatus(table('GM|CAPTIVA|2022-2025||'), { ...captiva, year: 2019 }, config)).toBe('no')
  })
  it('years in another form or a model spelled differently: unknown, never a false no', () => {
    for (const y of ['2022-', '2022+', '22-25', '2022, 2023', '2022/2025']) expect(fitStatus(table(`GM|CAPTIVA|${y}||`), captiva, config), y).toBe('unknown')
    expect(fitStatus(table('GM|CAPTIVA SPORT|2022-2025||'), captiva, config)).toBe('unknown')
    expect(parseRowYears('2012 – 2019')).toEqual([2012, 2019])
  })
  it('only the key, a malformed vehicle or no table: unknown; tags always win', () => {
    expect(fitStatus(table('GM|CAPTIVA|2022-2025||'), { key: captiva.key }, config)).toBe('unknown')
    expect(fitStatus(table('GM|CAPTIVA|2022-2025||'), { key: 'a/b/1/2', make: 'a' } as never, config)).toBe('unknown')
    expect(fitStatus({ tags: [], attributes: {} }, audi, config)).toBe('unknown')
    expect(fitStatus({ tags: ['fit:audi/a3/2020/1.4'], attributes: table('GM|CAPTIVA|2022-2025||').attributes }, audi, config)).toBe('fits')
  })
  it('makeVariants: no repeats, case-insensitive aliases', () => {
    expect(makeVariants('gm', fitmentConfig({ makeAliases: { gm: 'chevrolet' } }))).toEqual(['gm', 'chevrolet'])
    expect(makeVariants('chevrolet', fitmentConfig({ makeAliases: { GM: 'Chevrolet' } }))).toEqual(['chevrolet', 'gm'])
  })
})
