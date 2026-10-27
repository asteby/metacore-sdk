import { describe, expect, it } from 'vitest'
import {
  LIST_URL_EN,
  firstPageQuery,
  isFiltered,
  listApiParams,
  listHref,
  listQueryString,
  nextPageQuery,
  pagePosition,
  pageRange,
  previousPageQuery,
  readListQuery,
} from './account-lists.js'

describe('readListQuery', () => {
  it('reads a Spanish URL', () => {
    expect(readListQuery('?despues=abc_DEF-123&pos=11&estado=en_camino&entrega=envio&factura=si&desde=2026-01-01&hasta=2026-02-01&q=%231042')).toEqual({
      after: 'abc_DEF-123',
      pos: 11,
      status: 'en_camino',
      delivery: 'shipping',
      invoice: true,
      from: '2026-01-01',
      to: '2026-02-01',
      q: '1042',
    })
  })

  it('reads an English URL with its own names', () => {
    expect(readListQuery('before=zzz&delivery=pickup&invoice=no', LIST_URL_EN)).toEqual({ before: 'zzz', delivery: 'pickup', invoice: false })
  })

  it('drops everything malformed instead of failing (a hostile or stale link shows the plain list)', () => {
    const q = readListQuery(
      new URLSearchParams({ despues: 'a b/<script>', antes: '../etc', pos: '-3', estado: 'DROP TABLE', entrega: 'avion', factura: 'quizá', desde: '2026-13-45', hasta: 'ayer', q: 'x'.repeat(65) }),
    )
    expect(q).toEqual({})
  })

  it('ignores an end date before the start date, and prefers after over before', () => {
    expect(readListQuery('desde=2026-05-01&hasta=2026-04-01')).toEqual({ from: '2026-05-01' })
    expect(readListQuery('despues=aaa&antes=bbb')).toEqual({ after: 'aaa' })
    expect(readListQuery(null)).toEqual({})
    expect(readListQuery('pos=1.5')).toEqual({})
    expect(readListQuery('desde=2026-02-30')).toEqual({})
  })
})

describe('building links', () => {
  it('writes a stable query string and nothing for the first unfiltered page', () => {
    expect(listQueryString({})).toBe('')
    expect(listHref('/cuenta/pedidos', {})).toBe('/cuenta/pedidos')
    expect(listQueryString({ q: '1042', after: 'c1', pos: 11, status: 'delivered', delivery: 'pickup', invoice: false, from: '2026-01-01', to: '2026-01-31' })).toBe(
      '?despues=c1&pos=11&estado=delivered&entrega=recoger&factura=no&desde=2026-01-01&hasta=2026-01-31&q=1042',
    )
    expect(listQueryString({ pos: 1 })).toBe('')
  })

  it('round-trips through the URL', () => {
    const q = { after: 'c1', pos: 21, status: 'shipped', delivery: 'shipping' as const, invoice: true, from: '2026-01-01', to: '2026-02-02', q: 'A-9' }
    expect(readListQuery(listQueryString(q))).toEqual(q)
  })

  it('turns a query into API parameters', () => {
    expect(listApiParams({ after: 'c', status: 'x', delivery: 'pickup', invoice: false, from: '2026-01-01', to: '2026-01-02', q: '7' }, 10)).toEqual({
      first: 10,
      after: 'c',
      status: 'x',
      delivery_method: 'pickup',
      has_invoice: false,
      from: '2026-01-01',
      to: '2026-01-02',
      q: '7',
    })
    expect(listApiParams({ before: 'b' }, 25)).toEqual({ first: 25, before: 'b' })
    expect(listApiParams({}, 10)).toEqual({ first: 10 })
  })

  it('knows when it is filtered and drops the cursor to go to the first page', () => {
    expect(isFiltered({ after: 'a', pos: 11 })).toBe(false)
    expect(isFiltered({ invoice: false })).toBe(true)
    expect(firstPageQuery({ after: 'a', pos: 11, status: 's', q: '1' })).toEqual({ status: 's', q: '1' })
  })
})

describe('moving between pages', () => {
  const page1 = { query: {}, pageInfo: { has_next_page: true, end_cursor: 'e1', has_previous_page: false, start_cursor: 's1' }, count: 10, first: 10 }

  it('goes forward keeping the filters and counting the position', () => {
    const next = nextPageQuery({ ...page1, query: { status: 'delivered' } })
    expect(next).toEqual({ status: 'delivered', after: 'e1', pos: 11 })
    const page2 = { query: next!, pageInfo: { has_next_page: true, end_cursor: 'e2', has_previous_page: true, start_cursor: 's2' }, count: 10, first: 10 }
    expect(nextPageQuery(page2)).toEqual({ status: 'delivered', after: 'e2', pos: 21 })
    expect(previousPageQuery(page2)).toEqual({ status: 'delivered', before: 's2', pos: 1 })
  })

  it('returns to the plain first page when the server says there is nothing before', () => {
    const back = { query: { before: 's2', pos: 1 }, pageInfo: { has_next_page: true, end_cursor: 'e1', has_previous_page: false, start_cursor: 's1' }, count: 10, first: 10 }
    expect(previousPageQuery(back)).toEqual({})
    expect(pagePosition(back)).toBe(1)
  })

  it('has no previous link on the first page and no next link on the last', () => {
    expect(previousPageQuery(page1)).toBeNull()
    expect(nextPageQuery({ ...page1, pageInfo: { has_next_page: false, end_cursor: 'e' } })).toBeNull()
  })

  it('does not invent a position for a shared link without one', () => {
    const shared = { query: { after: 'x' }, pageInfo: { has_next_page: true, end_cursor: 'e', has_previous_page: true, start_cursor: 's' }, count: 10, first: 10 }
    expect(pagePosition(shared)).toBeUndefined()
    expect(nextPageQuery(shared)).toEqual({ after: 'e' })
    expect(previousPageQuery(shared)).toEqual({ before: 's' })
    expect(pageRange({ ...shared, total: 300 })).toBeNull()
  })

  it('says «11–20 of 300»', () => {
    expect(pageRange({ query: { after: 'x', pos: 11 }, pageInfo: { has_next_page: true, end_cursor: 'e', has_previous_page: true }, count: 10, total: 300 })).toEqual({ from: 11, to: 20, total: 300 })
    expect(pageRange({ ...page1, total: undefined })).toEqual({ from: 1, to: 10, total: null })
    expect(pageRange({ ...page1, count: 0 })).toBeNull()
  })
})
