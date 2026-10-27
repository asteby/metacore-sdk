/**
 * The URL side of the account lists (orders, invoices, shipments): what a list page reads from `?despues=…&estado=…`
 * and the links to the previous / next page. Framework-free (React Router, Next or plain links all use it), pure and
 * safe on untrusted input: everything read from a URL is validated, so a hand-edited or hostile query can never reach
 * the API as anything but a well-formed filter.
 *
 * A list URL is the whole state of the page (cursor, filters, position), so it can be shared, bookmarked and used with
 * the browser's back / forward buttons, and every link is a real `<a href>` that works without JavaScript.
 */
import type { PageInfo } from './types.js'
import type { AccountListParams, OrderListParams } from './query.js'

/** What a list page reads from its URL. Every field is optional; the cursors are opaque. */
export type ListQuery = {
  /** `page_info.end_cursor` of the page before: this page continues after it. */
  after?: string
  /** `page_info.start_cursor` of the page after: this page is the one before it. */
  before?: string
  /** 1-based position of the first item of the page, only for the «showing 11–20» text (a cursor has no page number). */
  pos?: number
  status?: string
  delivery?: 'shipping' | 'pickup'
  invoice?: boolean
  /** `YYYY-MM-DD` */
  from?: string
  /** `YYYY-MM-DD` */
  to?: string
  q?: string
}

/** The names a URL uses for each field, and the words for the values that are not free text. */
export type ListUrlNames = {
  after: string
  before: string
  pos: string
  status: string
  delivery: string
  invoice: string
  from: string
  to: string
  q: string
  /** The URL word of each delivery method. */
  deliveryValues: { shipping: string; pickup: string }
  /** The URL words of `invoice` (with / without an invoice). */
  invoiceValues: { yes: string; no: string }
}

/** Spanish URLs (`?despues=…&estado=en_camino&desde=2026-01-01`), the default of a Spanish store. */
export const LIST_URL_ES: ListUrlNames = {
  after: 'despues',
  before: 'antes',
  pos: 'pos',
  status: 'estado',
  delivery: 'entrega',
  invoice: 'factura',
  from: 'desde',
  to: 'hasta',
  q: 'q',
  deliveryValues: { shipping: 'envio', pickup: 'recoger' },
  invoiceValues: { yes: 'si', no: 'no' },
}

/** English URLs, the same as the API's own parameter names. */
export const LIST_URL_EN: ListUrlNames = {
  after: 'after',
  before: 'before',
  pos: 'pos',
  status: 'status',
  delivery: 'delivery',
  invoice: 'invoice',
  from: 'from',
  to: 'to',
  q: 'q',
  deliveryValues: { shipping: 'shipping', pickup: 'pickup' },
  invoiceValues: { yes: 'yes', no: 'no' },
}

const CURSOR = /^[A-Za-z0-9_-]{1,300}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/
const STATUS = /^[a-z_]{1,32}$/
const MAX_Q = 64
const MAX_POS = 1_000_000

const asParams = (search: URLSearchParams | string | undefined | null): URLSearchParams =>
  search instanceof URLSearchParams ? search : new URLSearchParams(typeof search === 'string' ? search : '')

const validDay = (v: string | null): string | undefined => {
  if (!v || !DAY.test(v)) return undefined
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? undefined : v
}

/**
 * Reads and validates a list URL. Unknown or malformed values are dropped (never an error): a stale or hand-edited link
 * simply shows the unfiltered list. `after` wins over `before` when both are present.
 */
export function readListQuery(search: URLSearchParams | string | undefined | null, names: ListUrlNames = LIST_URL_ES): ListQuery {
  const p = asParams(search)
  const out: ListQuery = {}
  const after = p.get(names.after)
  const before = p.get(names.before)
  if (after && CURSOR.test(after)) out.after = after
  else if (before && CURSOR.test(before)) out.before = before
  const pos = Number(p.get(names.pos))
  if (Number.isInteger(pos) && pos >= 1 && pos <= MAX_POS) out.pos = pos
  const status = p.get(names.status)
  if (status && STATUS.test(status)) out.status = status
  const delivery = p.get(names.delivery)
  if (delivery === names.deliveryValues.shipping) out.delivery = 'shipping'
  else if (delivery === names.deliveryValues.pickup) out.delivery = 'pickup'
  const invoice = p.get(names.invoice)
  if (invoice === names.invoiceValues.yes) out.invoice = true
  else if (invoice === names.invoiceValues.no) out.invoice = false
  const from = validDay(p.get(names.from))
  const to = validDay(p.get(names.to))
  if (from) out.from = from
  if (to && (!from || to >= from)) out.to = to
  const q = (p.get(names.q) ?? '').trim().replace(/^#/, '').trim()
  if (q && q.length <= MAX_Q) out.q = q
  return out
}

/** Are there filters on (cursor and position are not filters)? */
export function isFiltered(query: ListQuery): boolean {
  return !!(query.status || query.delivery || query.invoice !== undefined || query.from || query.to || query.q)
}

/** The same query without cursor and position: the first page of the same filters. */
export function firstPageQuery(query: ListQuery): ListQuery {
  const { after: _a, before: _b, pos: _p, ...filters } = query
  return filters
}

/** The API parameters of a list page. */
export function listApiParams(query: ListQuery, first: number): OrderListParams {
  const params: OrderListParams & AccountListParams = { first }
  if (query.after) params.after = query.after
  else if (query.before) params.before = query.before
  if (query.status) params.status = query.status
  if (query.delivery) params.delivery_method = query.delivery
  if (query.invoice !== undefined) params.has_invoice = query.invoice
  if (query.from) params.from = query.from
  if (query.to) params.to = query.to
  if (query.q) params.q = query.q
  return params
}

/** `?despues=…&estado=…` (with the leading `?`), or `''` for the first page without filters. Keys in a stable order. */
export function listQueryString(query: ListQuery, names: ListUrlNames = LIST_URL_ES): string {
  const p = new URLSearchParams()
  if (query.after) p.set(names.after, query.after)
  else if (query.before) p.set(names.before, query.before)
  if (query.pos && query.pos > 1) p.set(names.pos, String(query.pos))
  if (query.status) p.set(names.status, query.status)
  if (query.delivery) p.set(names.delivery, names.deliveryValues[query.delivery])
  if (query.invoice !== undefined) p.set(names.invoice, query.invoice ? names.invoiceValues.yes : names.invoiceValues.no)
  if (query.from) p.set(names.from, query.from)
  if (query.to) p.set(names.to, query.to)
  if (query.q) p.set(names.q, query.q)
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** `path` + the query string. */
export const listHref = (path: string, query: ListQuery, names: ListUrlNames = LIST_URL_ES): string => `${path}${listQueryString(query, names)}`

/** What the page the buyer is on knows about itself, to build the links around it. */
export type ListPageState = {
  query: ListQuery
  pageInfo: PageInfo | null | undefined
  /** Nodes on this page. */
  count: number
  /** Page size asked for. */
  first: number
}

/** 1-based position of the first node of this page: known when it is the first page, else what the URL carried. */
export function pagePosition({ query, pageInfo, count }: Pick<ListPageState, 'query' | 'pageInfo' | 'count'>): number | undefined {
  if (count === 0) return undefined
  if (!query.after && !query.before) return 1
  if (pageInfo && pageInfo.has_previous_page === false) return 1
  return query.pos
}

/** The query of the next (older) page, or `null` at the end. */
export function nextPageQuery(state: ListPageState): ListQuery | null {
  const { query, pageInfo, count } = state
  if (!pageInfo?.has_next_page || !pageInfo.end_cursor) return null
  const here = pagePosition(state)
  return { ...firstPageQuery(query), after: pageInfo.end_cursor, ...(here ? { pos: here + count } : {}) }
}

/** The query of the previous (newer) page, or `null` on the first. */
export function previousPageQuery(state: ListPageState): ListQuery | null {
  const { query, pageInfo, first } = state
  if (!query.after && !query.before) return null
  if (pageInfo?.has_previous_page === false) return firstPageQuery(query)
  const cursor = pageInfo?.start_cursor
  if (!cursor) return query.after || query.before ? firstPageQuery(query) : null
  const here = pagePosition(state)
  return { ...firstPageQuery(query), before: cursor, ...(here ? { pos: Math.max(1, here - first) } : {}) }
}

/** «from»–«to» of «total» for the «showing 11–20 of 300» text; `null` when the page is empty or the position is unknown. */
export function pageRange(state: Pick<ListPageState, 'query' | 'pageInfo' | 'count'> & { total?: number | null }): { from: number; to: number; total: number | null } | null {
  const from = pagePosition(state)
  if (!from || state.count === 0) return null
  return { from, to: from + state.count - 1, total: typeof state.total === 'number' && state.total >= 0 ? state.total : null }
}
