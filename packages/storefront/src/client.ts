import { StorefrontError, defaultCodeForStatus } from './errors.js'
import { isTokenPublishable } from './money.js'
import {
  appendParams,
  productListQuery,
  type ArticleListParams,
  type CollectionListParams,
  type PaginationParams,
  type ProductListParams,
  type QueryParams,
} from './query.js'
import type {
  Address,
  AddressInput,
  Article,
  Cart,
  CartBuyerInput,
  CartLineInput,
  CartLineUpdateInput,
  CheckoutInput,
  CheckoutResult,
  Collection,
  Connection,
  Customer,
  CustomerIdentifier,
  CustomerSession,
  CustomerSessionInput,
  DeliveryInput,
  DeliveryOptions,
  InvoiceRequest,
  InvoiceResult,
  Menu,
  Order,
  Page,
  Product,
  ProductConnection,
  ReturnRequest,
  ReturnRequestInput,
  Shop,
  StockLevel,
  StorefrontErrorBody,
  Theme,
} from './types.js'

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

/** Context passed to `onRequest` / `onResponse` hooks. */
export type StorefrontRequestContext = {
  method: string
  /** Absolute URL, including the query string. */
  url: string
  /** Route path relative to `baseUrl`, e.g. `/storefront/products/abc`. */
  path: string
  /** Final `RequestInit` (headers already merged). Hooks may mutate it. */
  init: RequestInit & { headers: Headers }
  /** Per-call options as given by the caller. */
  options: RequestOptions
}

export type StorefrontResponseContext = StorefrontRequestContext & {
  response: Response
  /** Milliseconds spent waiting for the response. */
  durationMs: number
}

export type StorefrontClientOptions = {
  /** Base URL of the gateway, e.g. `https://ops.example.com/api/gw`. Routes are appended as `/storefront/...`. */
  baseUrl: string
  /** `pk_...` (browser) or `sk_...` (server only). Sent as `Authorization: Bearer <token>`. */
  token: string
  /** Buyer session (`X-Customer-Token`) for `/storefront/customer/*` routes. */
  customerToken?: string | null
  /** Custom fetch (defaults to `globalThis.fetch`). */
  fetch?: FetchLike
  /** Sent as `Accept-Language`. */
  locale?: string
  /** Extra headers on every request. */
  headers?: Record<string, string>
  /** Abort requests that take longer than this (default: no timeout). */
  timeoutMs?: number
  /**
   * Runs before every request. Return a `Response` to short-circuit the
   * network (e.g. an SSR cache hit); return nothing to continue.
   */
  onRequest?: (ctx: StorefrontRequestContext) => void | Response | Promise<void | Response>
  /** Runs after every response (including short-circuited ones), before parsing. */
  onResponse?: (ctx: StorefrontResponseContext) => void | Promise<void>
}

/** Per-call options. Unknown keys (e.g. Next.js `next`) are forwarded to `fetch` as-is. */
export type RequestOptions = {
  cache?: RequestCache
  signal?: AbortSignal
  /** Framework fetch extensions, forwarded verbatim (e.g. `{ revalidate: 60, tags: ['products'] }`). */
  next?: Record<string, unknown>
  headers?: Record<string, string>
  /** Overrides the client-level timeout for this call. */
  timeoutMs?: number
  /** Overrides the client-level customer token for this call. */
  customerToken?: string | null
  [key: string]: unknown
}

export type WriteOptions = RequestOptions & {
  /** `Idempotency-Key` header. Auto-generated for checkout when omitted. */
  idempotencyKey?: string
}

export type PreviewOptions = RequestOptions & {
  /** Signed preview token: returns the draft (`private, no-store`). */
  preview?: string
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

type RequestSpec = {
  method: HttpMethod
  path: string
  query?: URLSearchParams | QueryParams
  body?: unknown
  options?: WriteOptions
  /** Resolve `null` instead of throwing on 404. */
  nullOn404?: boolean
}

const OWN_OPTION_KEYS = new Set(['headers', 'timeoutMs', 'customerToken', 'idempotencyKey', 'preview', 'signal'])

/** Generates an idempotency key (crypto.randomUUID when available). */
export function generateIdempotencyKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  // Non-cryptographic fallback for very old runtimes; the key only needs to be unique.
  return 'idem-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
}

function joinUrl(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/+$/, '') + path
}

function enc(segment: string): string {
  return encodeURIComponent(segment)
}

function linkSignals(signals: (AbortSignal | undefined)[]): { signal: AbortSignal | undefined; cleanup: () => void } {
  const active = signals.filter((s): s is AbortSignal => !!s)
  if (active.length === 0) return { signal: undefined, cleanup: () => {} }
  if (active.length === 1) return { signal: active[0], cleanup: () => {} }
  const controller = new AbortController()
  const listeners: [AbortSignal, () => void][] = []
  for (const s of active) {
    if (s.aborted) {
      controller.abort(s.reason)
      break
    }
    const on = () => controller.abort(s.reason)
    s.addEventListener('abort', on, { once: true })
    listeners.push([s, on])
  }
  return {
    signal: controller.signal,
    cleanup: () => listeners.forEach(([s, on]) => s.removeEventListener('abort', on)),
  }
}

async function readError(res: Response, url: string): Promise<StorefrontError> {
  let body: Partial<StorefrontErrorBody> | undefined
  try {
    const text = await res.text()
    body = text ? (JSON.parse(text) as Partial<StorefrontErrorBody>) : undefined
  } catch {
    body = undefined
  }
  const e = body?.error
  return new StorefrontError({
    status: res.status,
    code: e?.code ?? defaultCodeForStatus(res.status),
    message: e?.message ?? `Storefront API responded ${res.status}${res.statusText ? ' ' + res.statusText : ''}`,
    ...(e?.field ? { field: e.field } : {}),
    url,
  })
}

export function createStorefrontClient(config: StorefrontClientOptions) {
  if (!config.baseUrl) throw new TypeError('createStorefrontClient: baseUrl is required')
  if (!config.token) throw new TypeError('createStorefrontClient: token is required')
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'
  if (isBrowser && !isTokenPublishable(config.token) && config.token.startsWith('sk_')) {
    console.warn('[@asteby/storefront] A private sk_ token is being used in a browser. Use a public pk_ token instead.')
  }

  async function request<T>(spec: RequestSpec & { nullOn404: true }): Promise<T | null>
  async function request<T>(spec: RequestSpec): Promise<T>
  async function request<T>(spec: RequestSpec): Promise<T | null> {
    const fetchImpl: FetchLike | undefined = config.fetch ?? (globalThis.fetch ? globalThis.fetch.bind(globalThis) : undefined)
    if (!fetchImpl) throw new TypeError('createStorefrontClient: no fetch available; pass `fetch` in options')

    const options: WriteOptions = spec.options ?? {}
    const search = spec.query instanceof URLSearchParams ? spec.query : appendParams(new URLSearchParams(), spec.query)
    const qs = search.toString()
    const url = joinUrl(config.baseUrl, spec.path) + (qs ? `?${qs}` : '')

    const headers = new Headers(config.headers)
    headers.set('Accept', 'application/json')
    headers.set('Authorization', `Bearer ${config.token}`)
    if (config.locale) headers.set('Accept-Language', config.locale)
    const customerToken = options.customerToken !== undefined ? options.customerToken : config.customerToken
    if (customerToken) headers.set('X-Customer-Token', customerToken)
    if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey)
    if (spec.body !== undefined) headers.set('Content-Type', 'application/json')
    for (const [k, v] of Object.entries(options.headers ?? {})) headers.set(k, v)

    // Forward passthrough options (cache, next, ...) to fetch.
    const passthrough: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(options)) if (!OWN_OPTION_KEYS.has(k) && v !== undefined) passthrough[k] = v

    const timeoutMs = options.timeoutMs ?? config.timeoutMs
    const timeoutController = timeoutMs && timeoutMs > 0 ? new AbortController() : undefined
    const timer = timeoutController
      ? setTimeout(() => timeoutController.abort(new StorefrontError({ status: 0, code: 'timeout', message: `Request timed out after ${timeoutMs}ms`, url })), timeoutMs)
      : undefined
    const linked = linkSignals([options.signal, timeoutController?.signal])

    const init: RequestInit & { headers: Headers } = {
      ...passthrough,
      method: spec.method,
      headers,
      ...(spec.body !== undefined ? { body: JSON.stringify(spec.body) } : {}),
      ...(linked.signal ? { signal: linked.signal } : {}),
    }
    const ctx: StorefrontRequestContext = { method: spec.method, url, path: spec.path, init, options }

    const started = Date.now()
    let res: Response
    try {
      const hooked = config.onRequest ? await config.onRequest(ctx) : undefined
      res = hooked instanceof Response ? hooked : await fetchImpl(url, init)
    } catch (err) {
      if (timeoutController?.signal.aborted) {
        throw new StorefrontError({ status: 0, code: 'timeout', message: `Request timed out after ${timeoutMs}ms`, url, cause: err })
      }
      if (options.signal?.aborted) {
        throw new StorefrontError({ status: 0, code: 'aborted', message: 'Request aborted', url, cause: err })
      }
      if (err instanceof StorefrontError) throw err
      throw new StorefrontError({ status: 0, code: 'network', message: err instanceof Error ? err.message : 'Network error', url, cause: err })
    } finally {
      if (timer) clearTimeout(timer)
      linked.cleanup()
    }

    if (config.onResponse) await config.onResponse({ ...ctx, response: res, durationMs: Date.now() - started })

    if (res.status === 404 && spec.nullOn404) {
      // Drain the body so the connection can be reused.
      await res.text().catch(() => undefined)
      return null
    }
    if (res.status === 304) {
      throw new StorefrontError({ status: 304, code: 'not_modified', message: 'Not modified', url })
    }
    if (!res.ok) throw await readError(res, url)
    if (res.status === 204) return undefined as T

    const text = await res.text()
    if (!text) return undefined as T
    try {
      return JSON.parse(text) as T
    } catch (err) {
      throw new StorefrontError({ status: res.status, code: 'invalid_response', message: 'Response is not valid JSON', url, cause: err })
    }
  }

  const get = <T>(path: string, query?: URLSearchParams | QueryParams, options?: RequestOptions) =>
    request<T>({ method: 'GET', path, ...(query ? { query } : {}), ...(options ? { options } : {}) })
  const getOrNull = <T>(path: string, query?: URLSearchParams | QueryParams, options?: RequestOptions) =>
    request<T>({ method: 'GET', path, nullOn404: true, ...(query ? { query } : {}), ...(options ? { options } : {}) })
  const write = <T>(method: HttpMethod, path: string, body?: unknown, options?: WriteOptions) =>
    request<T>({ method, path, ...(body !== undefined ? { body } : {}), ...(options ? { options } : {}) })

  const cartPath = (id: string, rest = '') => `/storefront/carts/${enc(id)}${rest}`
  const previewQuery = (options?: PreviewOptions) => (options?.preview ? { preview: options.preview } : undefined)

  const client = {
    /** Resolved configuration (read-only). */
    config: Object.freeze({ ...config }) as Readonly<StorefrontClientOptions>,

    /** Low-level escape hatch: any route under `baseUrl`. */
    request,

    /** Returns a new client that sends the given buyer session token. */
    withCustomerToken(customerToken: string | null) {
      return createStorefrontClient({ ...config, customerToken })
    },

    shop: {
      get: (options?: RequestOptions) => get<Shop>('/storefront/shop', undefined, options),
    },

    products: {
      list: (params?: ProductListParams, options?: RequestOptions) =>
        get<ProductConnection>('/storefront/products', productListQuery(params), options),
      /** `null` when the product does not exist or is unpublished. */
      get: (handle: string, options?: RequestOptions) =>
        getOrNull<Product>(`/storefront/products/${enc(handle)}`, undefined, options),
      recommendations: (handle: string, options?: RequestOptions) =>
        get<{ nodes: Product[] }>(`/storefront/products/${enc(handle)}/recommendations`, undefined, options),
    },

    collections: {
      list: (params?: CollectionListParams, options?: RequestOptions) =>
        get<Connection<Collection>>('/storefront/collections', params as QueryParams, options),
      /** `null` when the collection does not exist. */
      get: (handle: string, options?: RequestOptions) =>
        getOrNull<Collection>(`/storefront/collections/${enc(handle)}`, undefined, options),
    },

    stock: {
      /** Stock for up to 250 SKUs. */
      get: (skus: string[], options?: RequestOptions) =>
        get<{ nodes: StockLevel[] }>('/storefront/stock', { sku: skus }, options),
    },

    carts: {
      create: (input: { lines?: CartLineInput[] } = {}, options?: WriteOptions) =>
        write<Cart>('POST', '/storefront/carts', input, options),
      /** `null` when the cart does not exist (e.g. expired cookie). */
      get: (id: string, options?: RequestOptions) => getOrNull<Cart>(cartPath(id), undefined, options),
      addLines: (id: string, lines: CartLineInput[], options?: WriteOptions) =>
        write<Cart>('POST', cartPath(id, '/lines'), { lines }, options),
      /** Quantity `0` removes the line. */
      updateLines: (id: string, lines: CartLineUpdateInput[], options?: WriteOptions) =>
        write<Cart>('PATCH', cartPath(id, '/lines'), { lines }, options),
      removeLines: (id: string, lineIds: string[], options?: WriteOptions) =>
        write<Cart>('PATCH', cartPath(id, '/lines'), { lines: lineIds.map((lid) => ({ id: lid, quantity: 0 })) }, options),
      setDiscountCodes: (id: string, codes: string[], options?: WriteOptions) =>
        write<Cart>('PUT', cartPath(id, '/discount-codes'), { codes }, options),
      setBuyer: (id: string, buyer: CartBuyerInput, options?: WriteOptions) =>
        write<Cart>('PUT', cartPath(id, '/buyer'), buyer, options),
      setShippingAddress: (id: string, address: AddressInput, options?: WriteOptions) =>
        write<Cart>('PUT', cartPath(id, '/shipping-address'), address, options),
      deliveryOptions: (id: string, options?: RequestOptions) =>
        get<DeliveryOptions>(cartPath(id, '/delivery-options'), undefined, options),
      setDelivery: (id: string, delivery: DeliveryInput, options?: WriteOptions) =>
        write<Cart>('PUT', cartPath(id, '/delivery'), delivery, options),
      /** Reserves stock and creates the order. Sends `Idempotency-Key` (auto-generated if omitted). */
      checkout: (id: string, input: CheckoutInput, options: WriteOptions = {}) =>
        write<CheckoutResult>('POST', cartPath(id, '/checkout'), input, {
          ...options,
          idempotencyKey: options.idempotencyKey ?? generateIdempotencyKey(),
        }),
    },

    customer: {
      /** Sends a one-time code by email or SMS/WhatsApp. */
      requestOtp: (identifier: CustomerIdentifier, options?: WriteOptions) =>
        write<void>('POST', '/storefront/customer/otp', identifier, options),
      /** Exchanges the code for a buyer session (`token` goes in `customerToken`). */
      createSession: (input: CustomerSessionInput, options?: WriteOptions) =>
        write<CustomerSession>('POST', '/storefront/customer/session', input, options),
      get: (options?: RequestOptions) => get<Customer>('/storefront/customer', undefined, options),
      orders: (params?: PaginationParams, options?: RequestOptions) =>
        get<Connection<Order>>('/storefront/customer/orders', params as QueryParams, options),
      /** `null` when the order does not exist or belongs to someone else. */
      order: (id: string, options?: RequestOptions) =>
        getOrNull<Order>(`/storefront/customer/orders/${enc(id)}`, undefined, options),
      requestReturn: (orderId: string, input: ReturnRequestInput, options?: WriteOptions) =>
        write<ReturnRequest>('POST', `/storefront/customer/orders/${enc(orderId)}/returns`, input, options),
      requestInvoice: (orderId: string, input: InvoiceRequest, options?: WriteOptions) =>
        write<InvoiceResult>('POST', `/storefront/customer/orders/${enc(orderId)}/invoice`, input, options),
      addresses: {
        list: (options?: RequestOptions) => get<{ nodes: Address[] }>('/storefront/customer/addresses', undefined, options),
        create: (address: AddressInput, options?: WriteOptions) =>
          write<Address>('POST', '/storefront/customer/addresses', address, options),
        update: (id: string, address: Partial<AddressInput>, options?: WriteOptions) =>
          write<Address>('PATCH', `/storefront/customer/addresses/${enc(id)}`, address, options),
        delete: (id: string, options?: WriteOptions) =>
          write<void>('DELETE', `/storefront/customer/addresses/${enc(id)}`, undefined, options),
      },
    },

    content: {
      theme: (options?: RequestOptions) => get<Theme>('/storefront/content/theme', undefined, options),
      /** `null` when the page does not exist. */
      page: (handle: string, options?: PreviewOptions) =>
        getOrNull<Page>(`/storefront/content/pages/${enc(handle)}`, previewQuery(options), options),
      /** `null` when the menu does not exist. */
      menu: (handle: string, options?: RequestOptions) =>
        getOrNull<Menu>(`/storefront/content/menus/${enc(handle)}`, undefined, options),
      articles: (params?: ArticleListParams, options?: RequestOptions) =>
        get<Connection<Article>>('/storefront/content/articles', params as QueryParams, options),
      /** `null` when the article does not exist. */
      article: (handle: string, options?: PreviewOptions) =>
        getOrNull<Article>(`/storefront/content/articles/${enc(handle)}`, previewQuery(options), options),
    },
  }
  return client
}

export type StorefrontClient = ReturnType<typeof createStorefrontClient>
