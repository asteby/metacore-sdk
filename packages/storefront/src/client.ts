import { StorefrontError, defaultCodeForStatus } from './errors.js'
import { isValidPoint, type GeoPoint } from './geo.js'
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
  CartRecommendations,
  PaymentAttemptResult,
  PaymentConfig,
  PaymentSubmitInput,
  PromotionsList,
  RecommendationPlacement,
  CheckoutInput,
  CheckoutResult,
  Collection,
  Connection,
  Customer,
  CustomerIdentifier,
  CustomerCapabilities,
  CustomerUpdateInput,
  CustomerPasswordLoginInput,
  CustomerRegisterInput,
  CustomerRegisterResult,
  CustomerResetPasswordInput,
  CustomerSession,
  CustomerSessionInput,
  CustomerSetPasswordInput,
  CustomerVerifyRegistrationInput,
  DeliveryInput,
  DeliveryOptions,
  PaymentMethods,
  InvoiceFile,
  InvoiceFileKind,
  InvoiceRequest,
  Location,
  LocationListParams,
  NearestLocation,
  InvoiceResult,
  Menu,
  Order,
  Page,
  PendingPayment,
  Product,
  ProductConnection,
  Region,
  ReturnRequest,
  ReturnRequestInput,
  Shop,
  RestockSubscriptionInput,
  RestockSubscriptionResult,
  StockLevel,
  StorefrontErrorBody,
  Theme,
  TokenIntrospection,
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
  /**
   * `pk_...` (browser) or `sk_...` (server only). Sent as `Authorization: Bearer <token>`. A function is called on
   * EVERY request, so a token read from a file (`createFileTokenSource` in `@asteby/storefront/node`) can rotate
   * without restarting the server.
   */
  token: string | (() => string)
  /** Buyer session (`X-Customer-Token`) for `/storefront/customer/*` routes. */
  customerToken?: string | null
  /** Custom fetch (defaults to `globalThis.fetch`). */
  fetch?: FetchLike
  /** Sent as `Accept-Language`. */
  locale?: string
  /**
   * Public host of the storefront (`godsnutrition.com`), sent as `X-Storefront-Domain`. Platform (`pt_`)
   * tokens need it to pick the organization; with an org-scoped token it only scopes the market.
   */
  domain?: string
  /**
   * Market the request is for (`mx`, `us`), sent as `<domain>#<market>` in `X-Storefront-Domain`. It lets ONE
   * public domain serve several markets (the storefront routes by path prefix, e.g. `/us`): OPS honors it
   * when the organization has that market active and otherwise falls back to the domain's own market.
   * Ignored without `domain`.
   */
  market?: string
  /** Extra headers on every request. */
  headers?: Record<string, string>
  /**
   * IP address of the shopper, for SERVER-side calls (SSR, route actions) made with an
   * `sk_`/`pt_` token. Sent as `X-Storefront-Client-IP`, which the gateway honors only for
   * tokens issued with the `trust_client_ip` option: the rate limit is then charged per
   * shopper instead of to the store's single token bucket, and the OTP flow limits the
   * shopper's IP instead of the server's. Pass the IP from your own connection or trusted
   * proxy, never from a header the browser can forge. Never sent with a `pk_` token (the
   * gateway already separates those by caller IP). Invalid values are dropped.
   */
  clientIp?: string | null
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
  /** Overrides the client-level shopper IP for this call (see `StorefrontClientOptions.clientIp`). */
  clientIp?: string | null
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

const OWN_OPTION_KEYS = new Set(['headers', 'timeoutMs', 'customerToken', 'clientIp', 'idempotencyKey', 'preview', 'signal'])

/** Header the gateway reads (only for tokens with `trust_client_ip`). */
export const CLIENT_IP_HEADER = 'X-Storefront-Client-IP'

/**
 * Returns the single IP literal in `raw`, or undefined. Takes the form a server hands over
 * (`::ffff:1.2.3.4`, `[2001:db8::1]`) and rejects lists, ports, zones and text so the
 * header is never a forgery vector.
 */
export function normalizeClientIp(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined
  let v = raw.trim()
  if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1)
  if (!v || v.length > 45 || /[\s,%/]/.test(v)) return undefined
  if (/^[0-9]{1,3}(\.[0-9]{1,3}){3}$/.test(v)) {
    return v.split('.').every((o) => Number(o) <= 255) ? v : undefined
  }
  // IPv6 (incl. IPv4-mapped): hex groups and colons, at most one "::".
  if (!v.includes(':') || !/^[0-9a-fA-F:.]+$/.test(v) || v.split('::').length > 2) return undefined
  try {
    new URL(`http://[${v}]/`)
  } catch {
    return undefined
  }
  return v
}

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

function scopeList(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string' && s.length > 0) : []
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
  // The gateway may put `code` / `required_scopes` at the top level or inside `error` (or its `details`).
  const top = body as { code?: unknown; required_scopes?: unknown } | undefined
  const code = e?.code ?? (typeof top?.code === 'string' ? top.code : undefined)
  const requiredScopes = code === 'insufficient_scope' ? scopeList(e?.required_scopes ?? top?.required_scopes ?? (e?.details as { required_scopes?: unknown } | undefined)?.required_scopes) : []
  return new StorefrontError({
    status: res.status,
    code: code ?? defaultCodeForStatus(res.status),
    ...(requiredScopes.length ? { requiredScopes } : {}),
    message: e?.message ?? `Storefront API responded ${res.status}${res.statusText ? ' ' + res.statusText : ''}`,
    ...(e?.field ? { field: e.field } : {}),
    ...(e?.details !== undefined ? { details: e.details } : {}),
    ...(typeof e?.retryable === 'boolean' ? { retryable: e.retryable } : {}),
    ...(typeof e?.retry_after === 'number' && e.retry_after > 0 ? { retryAfter: e.retry_after } : {}),
    ...(typeof e?.checkout_id === 'string' && e.checkout_id ? { checkoutId: e.checkout_id } : {}),
    ...(e?.cost !== undefined ? { cost: e.cost } : {}),
    ...(typeof e?.message_en === 'string' && e.message_en ? { messageEn: e.message_en } : {}),
    url,
  })
}

export function createStorefrontClient(config: StorefrontClientOptions) {
  if (!config.baseUrl) throw new TypeError('createStorefrontClient: baseUrl is required')
  if (!config.token) throw new TypeError('createStorefrontClient: token is required')
  const currentToken = (): string => {
    const t = typeof config.token === 'function' ? config.token() : config.token
    if (!t) throw new StorefrontError({ status: 0, code: 'unauthorized', message: 'Storefront token is empty (token source returned nothing)' })
    return t
  }
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'
  const initialToken = typeof config.token === 'string' ? config.token : ''
  if (isBrowser && initialToken.startsWith('sk_')) {
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
    const token = currentToken()
    headers.set('Authorization', `Bearer ${token}`)
    if (config.locale) headers.set('Accept-Language', config.locale)
    if (config.domain) headers.set('X-Storefront-Domain', storefrontDomainHeader(config.domain, config.market))
    const customerToken = options.customerToken !== undefined ? options.customerToken : config.customerToken
    if (customerToken) headers.set('X-Customer-Token', customerToken)
    const clientIp = options.clientIp !== undefined ? options.clientIp : config.clientIp
    // Server-side tokens only: a pk_ token already gets a per-caller bucket from the gateway.
    const ip = isTokenPublishable(token) ? undefined : normalizeClientIp(clientIp)
    if (ip) headers.set(CLIENT_IP_HEADER, ip)
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

    token: {
      /**
       * What the token in use is and can do (`GET {baseUrl}/_token`, a gateway route, not a `/storefront` one).
       * Needs no scope, so it answers even when the token is under-provisioned: `missing_scopes` says what to repair.
       */
      introspect: async (options?: RequestOptions): Promise<TokenIntrospection> => {
        // OPS answers with the kernel envelope `{success, data}`; a flat object is accepted too.
        const body = await get<TokenIntrospection | { success?: boolean; data?: TokenIntrospection }>('/_token', undefined, options)
        const env = body as { success?: unknown; data?: TokenIntrospection }
        return typeof env?.success === 'boolean' && env.data ? env.data : (body as TokenIntrospection)
      },
    },

    /** Returns a new client that sends the given buyer session token. */
    withCustomerToken(customerToken: string | null) {
      return createStorefrontClient({ ...config, customerToken })
    },

    /** Returns a new client that reports the shopper's IP (`X-Storefront-Client-IP`) on every call. */
    withClientIp(clientIp: string | null | undefined) {
      return createStorefrontClient({ ...config, clientIp: clientIp ?? null })
    },

    shop: {
      get: (options?: RequestOptions) => get<Shop>('/storefront/shop', undefined, options),
    },

    /**
     * How the market formats, taxes, addresses and invoices (`fiscal_id` carries the tax-id pattern, the regimes,
     * the invoice uses and the identity documents the buyer can upload). Cacheable; `null` when the organization
     * has no region configured.
     */
    region: (options?: RequestOptions) => getOrNull<Region>('/storefront/region', undefined, options),

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

    locations: {
      /** Branches of the shop. With `postal_code` they come ordered by distance (`distance_km`). */
      list: (params?: LocationListParams, options?: RequestOptions) =>
        get<{ nodes: Location[] }>('/storefront/locations', params as QueryParams, options),
      /** `null` when the branch does not exist or is not visible. */
      get: (id: string, options?: RequestOptions) =>
        getOrNull<Location>(`/storefront/locations/${enc(id)}`, undefined, options),
      /**
       * Branches ordered by distance to a point, closest first. The server rounds the coordinates (0.01°, ~1 km)
       * and never stores them; this client does not log or keep them either. The answer is `private, no-store`
       * (it depends on the buyer's position), so do not put it in a shared cache. Note `onRequest` hooks and
       * `fetch` wrappers do see the URL: do not log it. Throws `TypeError` for an invalid point.
       */
      nearest: (point: GeoPoint, options?: RequestOptions) => {
        if (!isValidPoint(point)) throw new TypeError('locations.nearest: lat/lng must be a valid point')
        return get<{ nodes: NearestLocation[] }>('/storefront/locations/nearest', { lat: point.lat, lng: point.lng }, { cache: 'no-store', ...options })
      },
    },

    stock: {
      /** Stock for up to 250 SKUs. */
      get: (skus: string[], options?: RequestOptions) =>
        get<{ nodes: StockLevel[] }>('/storefront/stock', { sku: skus }, options),
    },

    restock: {
      /**
       * "Notify me when it is back". Idempotent per contact + SKU; always answers `202 pending`.
       * Only offered when `availability.notify_available` is true. Needs `customer:write`.
       */
      subscribe: (input: RestockSubscriptionInput, options?: WriteOptions) =>
        write<RestockSubscriptionResult>('POST', '/storefront/restock-subscriptions', input, options),
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
      /** Payment providers active for the cart's market; send the chosen `key` as `payment_method`. */
      paymentMethods: (id: string, options?: RequestOptions) =>
        get<PaymentMethods>(cartPath(id, '/payment-methods'), undefined, options),
      setDelivery: (id: string, delivery: DeliveryInput, options?: WriteOptions) =>
        write<Cart>('PUT', cartPath(id, '/delivery'), delivery, options),
      /** Order note (up to 1000 characters). `null` or empty clears it. */
      setNote: (id: string, note: string | null, options?: WriteOptions) =>
        write<Cart>('PUT', cartPath(id, '/note'), { note }, options),
      /**
       * Asks for an invoice for this cart (`null` or `{ requested: false }` withdraws it). The server validates the
       * data against the region BEFORE any charge: `422` with `field: 'invoice.<field>'` (e.g. `invoice.tax_regime`)
       * names what to fix. `409 already_checked_out` when the cart is already an order. Checkout uses it when
       * `CheckoutInput.invoice` is omitted.
       */
      setInvoice: (id: string, invoice: InvoiceRequest | null, options?: WriteOptions) =>
        write<Cart>('PUT', cartPath(id, '/invoice'), invoice ?? { requested: false }, options),
      /**
       * Cross-sell suggestions: only sellable variants, with `unlocks` when adding one reaches the next
       * discount tier. `first` 1-8 (default 4). `private, no-store`; ask on demand, not on every render.
       */
      recommendations: (id: string, params: { first?: number; placement?: RecommendationPlacement } = {}, options?: RequestOptions) =>
        get<CartRecommendations>(cartPath(id, '/recommendations'), params as QueryParams, options),
      /** Reserves stock and creates the order. Sends `Idempotency-Key` (auto-generated if omitted). */
      checkout: (id: string, input: CheckoutInput, options: WriteOptions = {}) =>
        write<CheckoutResult>('POST', cartPath(id, '/checkout'), input, {
          ...options,
          idempotencyKey: options.idempotencyKey ?? generateIdempotencyKey(),
        }),
    },

    promotions: {
      /** Public promotions and the entry pop-up announcement for the request's market (cacheable). */
      list: (options?: RequestOptions) => get<PromotionsList>('/storefront/promotions', undefined, options),
    },

    checkouts: {
      /** What to mount for an embedded checkout (public key, options, amount) and whether it can still be paid. Never cache. */
      paymentConfig: (id: string, options?: RequestOptions) =>
        getOrNull<PaymentConfig>(`/storefront/checkouts/${enc(id)}/payment-config`, undefined, options),
      /**
       * Pays a checkout in the page. The browser brings only what the provider SDK returned (`provider_data`);
       * the amount is the server's. `idempotencyKey` is REQUIRED (use `paymentIdempotencyKey(checkoutId, attempt)`):
       * repeating a call with the same key never charges twice. Needs a server token (`checkout:write`).
       */
      pay: (id: string, input: PaymentSubmitInput, options: WriteOptions & { idempotencyKey: string }) => {
        if (!options || typeof options.idempotencyKey !== 'string' || !options.idempotencyKey.trim()) {
          throw new TypeError('checkouts.pay: idempotencyKey is required')
        }
        return write<PaymentAttemptResult>('POST', `/storefront/checkouts/${enc(id)}/payment`, input, options)
      },
      /**
       * Reads a placed checkout (same shape as the `carts.checkout` result). `order.number` is `null` until OPS
       * has created the order (a few hundred ms after checkout); poll once or twice and, if it is still `null`,
       * keep telling the buyer the number will arrive by email. Needs a server token (`checkout:write`).
       * `null` when the checkout does not exist. Never cache.
       */
      get: (id: string, options?: RequestOptions) =>
        getOrNull<CheckoutResult>(`/storefront/checkouts/${enc(id)}`, undefined, options),
    },

    customer: {
      /** Sends a one-time code by email or SMS/WhatsApp. */
      requestOtp: (identifier: CustomerIdentifier, options?: WriteOptions) =>
        write<void>('POST', '/storefront/customer/otp', identifier, options),
      /** Exchanges the code for a buyer session (`token` goes in `customerToken`). */
      createSession: (input: CustomerSessionInput, options?: WriteOptions) =>
        write<CustomerSession>('POST', '/storefront/customer/session', input, options),
      /** What the store supports (password login, email verification, OTP channels). Drives which forms to show. */
      capabilities: (options?: RequestOptions) =>
        get<CustomerCapabilities>('/storefront/customer/capabilities', undefined, options),
      /**
       * Creates an account with email + password. `verification_required` (202): a code was emailed, finish with
       * `verifyRegistration`. `created` (201): the account exists and `session` is ready. `409` when the email is taken.
       */
      register: async (input: CustomerRegisterInput, options?: WriteOptions): Promise<CustomerRegisterResult> => {
        const res = await write<{ status: 'verification_required' } | CustomerSession>('POST', '/storefront/customer/register', input, options)
        return res && 'token' in res ? { status: 'created', session: res } : { status: 'verification_required' }
      },
      /** Confirms the emailed registration code and returns the new buyer session. */
      verifyRegistration: (input: CustomerVerifyRegistrationInput, options?: WriteOptions) =>
        write<CustomerSession>('POST', '/storefront/customer/register/verify', input, options),
      /** Email + password login. `401` for wrong credentials. */
      loginWithPassword: (input: CustomerPasswordLoginInput, options?: WriteOptions) =>
        write<CustomerSession>('POST', '/storefront/customer/login', input, options),
      /** Sets or changes the password of the signed-in buyer (`options.customerToken`, or a `withCustomerToken` client). */
      setPassword: (input: CustomerSetPasswordInput, options?: WriteOptions) =>
        write<void>('PUT', '/storefront/customer/password', input, options),
      /** Resets a forgotten password with the code from `requestOtp({ email })`. */
      resetPassword: (input: CustomerResetPasswordInput, options?: WriteOptions) =>
        write<void>('POST', '/storefront/customer/password/reset', input, options),
      get: (options?: RequestOptions) => get<Customer>('/storefront/customer', undefined, options),
      /** Updates the profile and the saved fiscal data; `fiscal: null` deletes the latter. `422` with `field: 'fiscal.<field>'`. */
      update: (input: CustomerUpdateInput, options?: WriteOptions) =>
        write<Customer>('PATCH', '/storefront/customer', input, options),
      orders: (params?: PaginationParams, options?: RequestOptions) =>
        get<Connection<Order>>('/storefront/customer/orders', params as QueryParams, options),
      /** `null` when the order does not exist or belongs to someone else. */
      order: (id: string, options?: RequestOptions) =>
        getOrNull<Order>(`/storefront/customer/orders/${enc(id)}`, undefined, options),
      requestReturn: (orderId: string, input: ReturnRequestInput, options?: WriteOptions) =>
        write<ReturnRequest>('POST', `/storefront/customer/orders/${enc(orderId)}/returns`, input, options),
      requestInvoice: (orderId: string, input: InvoiceRequest, options?: WriteOptions) =>
        write<InvoiceResult>('POST', `/storefront/customer/orders/${enc(orderId)}/invoice`, input, options),
      /**
       * Checkouts waiting for their payment (cash voucher: OXXO, SPEI). They are not orders yet; once the payment
       * confirms they leave this list and show up in `orders`.
       */
      pendingPayments: (params?: PaginationParams, options?: RequestOptions) =>
        get<Connection<PendingPayment>>('/storefront/customer/pending-payments', params as QueryParams, options),
      /**
       * Reads one file (`pdf` | `xml`) of an invoice or credit note of the buyer's order, through the authenticated
       * route (`order_invoice_file`): the answer is the file itself (base64), never a URL, so neither the buyer token
       * nor a link of the PAC reaches the browser. Call it from YOUR server and stream the bytes
       * (`invoiceFileBytes`). `null` when the order, the document or the file does not exist or is not the buyer's.
       */
      invoiceFile: async (orderId: string, invoiceId: string, kind: InvoiceFileKind, options?: RequestOptions): Promise<InvoiceFile | null> => {
        if (kind !== 'pdf' && kind !== 'xml') throw new TypeError("invoiceFile: kind must be 'pdf' or 'xml'")
        const file = await getOrNull<InvoiceFile>(`/storefront/customer/orders/${enc(orderId)}/invoices/${enc(invoiceId)}/${kind}`, undefined, { ...options, cache: 'no-store' })
        if (file === null) return null
        if (!file || typeof file.content_base64 !== 'string' || typeof file.filename !== 'string' || typeof file.content_type !== 'string') {
          throw new StorefrontError({ status: 502, code: 'invalid_response', message: 'The invoice file answer is not a file' })
        }
        return { filename: file.filename, content_type: file.content_type, content_base64: file.content_base64 }
      },
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

/** `X-Storefront-Domain` value: the host, plus `#<market>` when a valid market code is given. */
export function storefrontDomainHeader(domain: string, market?: string | null): string {
  const host = domain.trim()
  const code = (market ?? '').trim().toLowerCase()
  return code && /^[a-z0-9_-]{1,32}$/.test(code) ? `${host}#${code}` : host
}
