import type { ProductSort } from './types.js'

export type QueryValue = string | number | boolean | null | undefined
export type QueryParams = Record<string, QueryValue | QueryValue[]>

export type PaginationParams = {
  /** Page size (1–100; articles accept at most 50). */
  first?: number
  /** Cursor from `page_info.end_cursor`. */
  after?: string | null
}

/**
 * Cursor paging of the account lists (contract 1.19). `first` is 1–50 (10 by default). `after` goes to the next
 * (older) page with `page_info.end_cursor`; `before` goes back with `page_info.start_cursor`; never both.
 */
export type AccountListParams = {
  first?: number
  after?: string | null
  before?: string | null
  /** From this day (UTC, inclusive; `YYYY-MM-DD`) or an RFC 3339 instant. */
  from?: string
  /** Until this day (UTC, inclusive; `YYYY-MM-DD`) or an RFC 3339 instant (exclusive). */
  to?: string
  /** An exact order number (case-insensitive; a leading «#» is fine). */
  q?: string
}

/** Filters of `customer.orders.list` (derived ones are applied to bounded batches: a short page with `has_next_page` is valid). */
export type OrderListParams = AccountListParams & {
  /** An order status (`placed`, `accepted`, `fulfilling`, `ready`, `shipped`, `delivered`, `cancelled`) or progress stage (`pending_payment`, `paid`, `preparing`, `ready_for_pickup`, `in_transit`, `out_for_delivery`, `refunded`). */
  status?: string
  delivery_method?: 'shipping' | 'pickup'
  /** With an invoice (issued or on its way) or without one. */
  has_invoice?: boolean
}

export type InvoiceListParams = AccountListParams & { status?: 'issued' | 'pending' | 'cancelled' | 'error' }

export type ShipmentListParams = AccountListParams & {
  /** A parcel status: `pending`, `label_created`, `in_transit`, `out_for_delivery`, `delivered`, `exception`, `returned`, `lost`, `cancelled`. */
  status?: string
}

export type ProductListParams = PaginationParams & {
  /** Free-text search. */
  q?: string
  /** Collection handle. */
  collection?: string
  sort?: ProductSort
  /** Only products available for sale. */
  available?: boolean
  price_min?: number | string
  price_max?: number | string
  /**
   * Attribute filters, serialized as repeated `filter.<key>=<value>` params.
   * Values of one key are OR-ed; different keys are AND-ed.
   * e.g. `{ vendor: ['A', 'B'], rim: 16 }`.
   */
  filters?: Record<string, QueryValue | QueryValue[]>
  /** Restrict to these handles (max 100). Serialized comma-separated. */
  handles?: string[]
  /**
   * Only products carrying at least one of these tags (OR, at most 5 of 120 characters; contract 1.9). Serialized
   * comma-separated. A parts store passes `fitTagsAny(fitKey)` (`fit:<key>`, `fit:universal`); any tag works.
   */
  tags_any?: string[]
}

export type CollectionListParams = PaginationParams

export type ArticleListParams = Omit<PaginationParams, 'first'> & {
  /** Page size (1–50). The API answers 400 `validation` above 50. */
  first?: number
  tag?: string
  q?: string
}

/** The query of an account list: only what is set (no empty strings, no `undefined`), booleans as `true` / `false`. */
export function accountListQuery(params: (AccountListParams & Record<string, QueryValue | undefined>) | undefined): QueryParams | undefined {
  if (!params) return undefined
  const out: QueryParams = {}
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    out[key] = value
  }
  return out
}

/** Appends params to a URLSearchParams, repeating keys for arrays and skipping nullish values. */
export function appendParams(search: URLSearchParams, params: QueryParams | undefined): URLSearchParams {
  if (!params) return search
  for (const [key, raw] of Object.entries(params)) {
    const values = Array.isArray(raw) ? raw : [raw]
    for (const v of values) {
      if (v === undefined || v === null || v === '') continue
      search.append(key, String(v))
    }
  }
  return search
}

/** Serializes product list params per the contract (`filter.<attr>` repeated, `handles` comma-separated). */
export function productListQuery(params: ProductListParams = {}): URLSearchParams {
  const { filters, handles, tags_any, ...rest } = params
  const search = appendParams(new URLSearchParams(), rest as QueryParams)
  if (handles && handles.length > 0) search.set('handles', handles.join(','))
  if (tags_any && tags_any.length > 0) {
    if (tags_any.length > 5) throw new RangeError('tags_any takes at most 5 tags')
    // The API splits on commas: a tag that holds one would become two.
    if (tags_any.some((t) => t.includes(',') || t.length > 120)) throw new TypeError('tags_any: a tag has at most 120 characters and no comma')
    search.set('tags_any', tags_any.join(','))
  }
  if (filters) {
    for (const [key, raw] of Object.entries(filters)) {
      const name = key.startsWith('filter.') ? key : `filter.${key}`
      appendParams(search, { [name]: raw })
    }
  }
  return search
}

/** Reads `filter.<key>` params back into a filters record (useful in route loaders). */
export function parseProductFilters(search: URLSearchParams): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [key, value] of search) {
    if (!key.startsWith('filter.')) continue
    const name = key.slice('filter.'.length)
    ;(out[name] ??= []).push(value)
  }
  return out
}
