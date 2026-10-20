/**
 * In-memory implementation of the whole Storefront API v1 contract, exposed
 * as a `fetch` function. Use it to develop and test storefronts without OPS:
 *
 *   const mock = createMockStorefront()
 *   const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
 */
import type {
  Address,
  Availability,
  InsufficientStockLine,
  Article,
  Cart,
  CartLine,
  Collection,
  Customer,
  Facet,
  Location,
  Menu,
  Order,
  Page,
  Product,
  ProductVariant,
  Shop,
  StorefrontErrorCode,
  Theme,
} from '../types.js'
import { isValidPoint, rankByDistance } from '../geo.js'
import { resolveAvailability } from '../availability.js'
import {
  MOCK_CURRENCY,
  MOCK_IMAGE_URL,
  buildArticles,
  buildCollections,
  MOCK_POSTAL_CENTROIDS,
  buildCustomers,
  buildMemberships,
  buildMenus,
  buildPages,
  buildProducts,
  buildShop,
  buildTheme,
  type MockImageUrl,
} from './seed.js'

export { MOCK_CURRENCY, MOCK_CUSTOMER_EMAIL, MOCK_IMAGE_URL, MOCK_POSTAL_CENTROIDS } from './seed.js'
export type { MockImageUrl } from './seed.js'

export type MockStorefrontOptions = {
  /** Currency for all prices (default `MXN`). */
  currency?: string
  /** Image URL builder for seed data (default: picsum.photos placeholders). */
  imageUrl?: MockImageUrl
  /** OTP code accepted by `/customer/session` (default `000000`). */
  otpCode?: string
  /** Discount codes → percentage off the subtotal (default `{ BIENVENIDA10: 10 }`). */
  discountCodes?: Record<string, number>
  /** Flat shipping rate (default 149). Free from `shop.policies.free_shipping_min`. */
  flatShipping?: number
  /** Enforce token scopes (`pk_` cannot checkout or use customer routes). Default true. */
  enforceScopes?: boolean
  /**
   * Mock `show_stock`: `low_stock_threshold:N` semantics. At or below this quantity a variant is `low_stock`
   * and only then `availability.quantity` is published (default 5; `0` disables `low_stock`).
   */
  lowStockThreshold?: number
  /** Artificial latency per request, in ms (default 0). */
  latencyMs?: number
  /** Override seed data. */
  shop?: Partial<Shop>
  products?: Product[]
  collections?: Collection[]
  /** Product handle → collection handles (required when overriding `products`). */
  memberships?: Record<string, string[]>
  theme?: Theme
  pages?: Page[]
  menus?: Menu[]
  articles?: Article[]
}

type CartRecord = {
  id: string
  lines: { id: string; variant_id: string; quantity: number }[]
  codes: string[]
  buyer: Cart['buyer']
  shipping_address: Address | null
  delivery: Cart['delivery']
  updated_at: string
}

export type MockState = {
  shop: Shop
  products: Product[]
  collections: Collection[]
  memberships: Record<string, string[]>
  theme: Theme
  pages: Page[]
  menus: Menu[]
  articles: Article[]
  carts: Map<string, CartRecord>
  customers: Customer[]
  addresses: Map<string, Address[]>
  orders: (Order & { customer_id: string | null })[]
  otps: Map<string, string>
  sessions: Map<string, string>
  idempotency: Map<string, { status: number; body: unknown }>
  checkouts: Map<string, unknown>
  /** `contact|sku` of accepted "notify me" subscriptions. */
  restock: Set<string>
  seq: number
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: StorefrontErrorCode,
    message: string,
    readonly field?: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

const PUBLIC_CACHE = 'public, max-age=60, stale-while-revalidate=600'
const PRIVATE_CACHE = 'private, no-store'

const toCents = (amount: string) => Math.round(Number.parseFloat(amount) * 100)
const fromCents = (cents: number, currency: string) => ({ amount: (cents / 100).toFixed(2), currency_code: currency })

function fnv1a(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

function encodeCursor(offset: number): string {
  return btoa(`o:${offset}`)
}

function decodeCursor(cursor: string | null): number {
  if (!cursor) return 0
  try {
    const raw = atob(cursor)
    if (!raw.startsWith('o:')) throw new Error('bad cursor')
    const n = Number(raw.slice(2))
    if (!Number.isInteger(n) || n < 0) throw new Error('bad cursor')
    return n
  } catch {
    throw new HttpError(400, 'validation', 'Invalid cursor', 'after')
  }
}

function paginate<T>(items: T[], search: URLSearchParams, defaultFirst = 24, maxFirst = 100) {
  const first = search.has('first') ? Number(search.get('first')) : defaultFirst
  if (!Number.isInteger(first) || first < 1 || first > maxFirst) throw new HttpError(400, 'validation', `\`first\` must be between 1 and ${maxFirst}`, 'first')
  const start = decodeCursor(search.get('after'))
  const nodes = items.slice(start, start + first)
  const end = start + nodes.length
  return {
    nodes,
    page_info: { has_next_page: end < items.length, end_cursor: nodes.length ? encodeCursor(end) : null },
    total_count: items.length,
  }
}

const now = () => new Date().toISOString()

export function createMockStorefront(options: MockStorefrontOptions = {}) {
  const currency = options.currency ?? MOCK_CURRENCY
  const imageUrl = options.imageUrl ?? MOCK_IMAGE_URL
  const otpCode = options.otpCode ?? '000000'
  const discountCodes = Object.fromEntries(
    Object.entries(options.discountCodes ?? { BIENVENIDA10: 10 }).map(([k, v]) => [k.toUpperCase(), v]),
  )
  const flatShippingCents = Math.round((options.flatShipping ?? 149) * 100)
  const enforceScopes = options.enforceScopes ?? true

  function seed(): MockState {
    return {
      shop: { ...buildShop(currency, imageUrl), ...options.shop },
      products: structuredClone(options.products ?? buildProducts(currency, imageUrl)),
      collections: structuredClone(options.collections ?? buildCollections(imageUrl)),
      memberships: structuredClone(options.memberships ?? buildMemberships()),
      theme: structuredClone(options.theme ?? buildTheme()),
      pages: structuredClone(options.pages ?? buildPages(imageUrl)),
      menus: structuredClone(options.menus ?? buildMenus()),
      articles: structuredClone(options.articles ?? buildArticles(imageUrl)),
      carts: new Map(),
      customers: buildCustomers(),
      addresses: new Map(),
      orders: [
        {
          id: 'ord_seed_1',
          number: '1000',
          status: 'fulfilled',
          created_at: '2026-08-20T18:00:00.000Z',
          total: fromCents(24900, currency),
          customer_id: 'cus_1',
          lines: [
            { title: 'Playera básica', variant_title: 'M / Blanco', sku: null, quantity: 1, unit: fromCents(24900, currency), total: fromCents(24900, currency), image: null },
          ],
        },
      ],
      otps: new Map(),
      sessions: new Map(),
      idempotency: new Map(),
      checkouts: new Map(),
      restock: new Set(),
      seq: 0,
    }
  }

  const lowStockThreshold = options.lowStockThreshold ?? 5

  /** Recomputes `availability` (and the legacy fields) of every variant/product from `quantity_available`. */
  function syncAvailability(products: Product[]) {
    for (const p of products) {
      for (const v of p.variants) {
        const qty = v.quantity_available
        const sellable = v.available_for_sale && (qty === null || qty > 0)
        v.available_for_sale = sellable
        const low = sellable && qty !== null && lowStockThreshold > 0 && qty <= lowStockThreshold
        v.availability = {
          status: !sellable ? 'out_of_stock' : low ? 'low_stock' : 'in_stock',
          quantity: low ? qty : null,
          max_per_order: sellable ? (qty === null ? null : Math.min(qty, 10)) : null,
          restock_eta: null,
          preorder_release_at: null,
          notify_available: !sellable,
        }
      }
      p.available_for_sale = p.variants.some((v) => v.available_for_sale)
      const rank = ['in_stock', 'low_stock', 'backorder', 'preorder', 'out_of_stock']
      const best = p.variants.map((v) => v.availability as Availability).sort((a, b) => rank.indexOf(a.status) - rank.indexOf(b.status))[0]
      p.availability = best ?? resolveAvailability(p)
    }
  }

  let state = seed()
  syncAvailability(state.products)
  const nextId = (prefix: string) => `${prefix}_${(++state.seq).toString(36)}${Math.random().toString(36).slice(2, 8)}`

  // -------------------------------------------------------------------------
  // Catalog helpers
  // -------------------------------------------------------------------------

  function findVariant(variantId: string): { product: Product; variant: ProductVariant } | null {
    for (const product of state.products) {
      const variant = product.variants.find((v) => v.id === variantId)
      if (variant) return { product, variant }
    }
    return null
  }

  const minPriceCents = (p: Product) => toCents(p.price_range.min.amount)

  function attrValue(p: Product, key: string): string | null {
    if (key === 'vendor') return p.vendor
    if (key === 'product_type') return p.product_type
    if (key === 'tag') return null
    const v = p.attributes[key]
    return v === undefined ? null : String(v)
  }

  function matchesText(p: Product, q: string): number {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    const hay = [p.title, p.description, p.vendor ?? '', p.product_type ?? '', ...p.tags, ...Object.values(p.attributes).map(String)]
      .join(' ')
      .toLowerCase()
    let score = 0
    for (const t of terms) {
      if (!hay.includes(t)) return 0
      score += p.title.toLowerCase().includes(t) ? 2 : 1
    }
    return score
  }

  function listProducts(search: URLSearchParams) {
    let items = state.products.slice()
    const q = search.get('q')?.trim()
    const scores = new Map<string, number>()
    if (q) {
      items = items.filter((p) => {
        const s = matchesText(p, q)
        scores.set(p.id, s)
        return s > 0
      })
    }
    const collection = search.get('collection')
    if (collection) {
      if (!state.collections.some((c) => c.handle === collection)) throw new HttpError(404, 'not_found', `Collection ${collection} not found`, 'collection')
      items = items.filter((p) => state.memberships[p.handle]?.includes(collection))
    }
    const handles = search.get('handles')
    if (handles) {
      const list = handles.split(',').map((h) => h.trim()).filter(Boolean)
      if (list.length > 100) throw new HttpError(400, 'validation', 'At most 100 handles', 'handles')
      items = items.filter((p) => list.includes(p.handle))
    }

    // Facets are computed over the base set (text/collection/handles), before refinement.
    const base = items

    if (search.get('available') === 'true') items = items.filter((p) => p.available_for_sale)
    const priceMin = search.get('price_min')
    const priceMax = search.get('price_max')
    if (priceMin) items = items.filter((p) => minPriceCents(p) >= Math.round(Number(priceMin) * 100))
    if (priceMax) items = items.filter((p) => minPriceCents(p) <= Math.round(Number(priceMax) * 100))

    const filters = new Map<string, string[]>()
    for (const [key, value] of search) {
      if (!key.startsWith('filter.')) continue
      const name = key.slice(7)
      filters.set(name, [...(filters.get(name) ?? []), value])
    }
    for (const [key, values] of filters) {
      if (key === 'tag') items = items.filter((p) => values.some((v) => p.tags.includes(v)))
      else items = items.filter((p) => values.includes(attrValue(p, key) ?? '\u0000'))
    }

    const sort = search.get('sort') ?? 'relevance'
    const sorters: Record<string, (a: Product, b: Product) => number> = {
      relevance: (a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0),
      price_asc: (a, b) => minPriceCents(a) - minPriceCents(b),
      price_desc: (a, b) => minPriceCents(b) - minPriceCents(a),
      newest: (a, b) => b.updated_at.localeCompare(a.updated_at),
      title_asc: (a, b) => a.title.localeCompare(b.title, 'es'),
    }
    const sorter = sorters[sort]
    if (!sorter) throw new HttpError(400, 'validation', `Unknown sort ${sort}`, 'sort')
    items = items.slice().sort(sorter)

    return { ...paginate(items, search), facets: buildFacets(base) }
  }

  function buildFacets(products: Product[]): Facet[] {
    const facets: Facet[] = []
    const listFacet = (key: string, label: string, pick: (p: Product) => string | null) => {
      const counts = new Map<string, number>()
      for (const p of products) {
        const v = pick(p)
        if (v !== null && v !== '') counts.set(v, (counts.get(v) ?? 0) + 1)
      }
      if (counts.size === 0) return
      const values = [...counts.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true }))
        .map(([value, count]) => ({ value, label: value, count }))
      facets.push({ key, label, type: 'list', values })
    }
    listFacet('vendor', 'Marca', (p) => p.vendor)
    listFacet('product_type', 'Tipo', (p) => p.product_type)
    const attrKeys = new Set<string>()
    for (const p of products) for (const k of Object.keys(p.attributes)) attrKeys.add(k)
    const labels: Record<string, string> = { width: 'Ancho', aspect: 'Perfil', rim: 'Rin', size_key: 'Medida', load_index: 'Índice de carga', speed_rating: 'Índice de velocidad', runflat: 'Run flat' }
    for (const k of [...attrKeys].sort()) listFacet(k, labels[k] ?? k, (p) => (p.attributes[k] === undefined ? null : String(p.attributes[k])))
    if (products.length) {
      const prices = products.map(minPriceCents)
      const min = Math.min(...prices)
      const max = Math.max(...prices)
      facets.push({
        key: 'price',
        label: 'Precio',
        type: 'price_range',
        values: [
          { value: (min / 100).toFixed(2), label: 'min', count: products.length },
          { value: (max / 100).toFixed(2), label: 'max', count: products.length },
        ],
      })
    }
    return facets
  }

  // -------------------------------------------------------------------------
  // Cart helpers
  // -------------------------------------------------------------------------

  function getCartRecord(id: string): CartRecord {
    const cart = state.carts.get(id)
    if (!cart) throw new HttpError(404, 'not_found', `Cart ${id} not found`, 'id')
    return cart
  }

  function validateLines(lines: unknown, cart?: CartRecord): { variant_id: string; quantity: number }[] {
    if (!Array.isArray(lines)) throw new HttpError(400, 'validation', '`lines` must be an array', 'lines')
    const toCheck: Parameters<typeof checkStock>[0] = []
    const out = lines.map((raw, i) => {
      const l = raw as { variant_id?: unknown; quantity?: unknown }
      if (typeof l.variant_id !== 'string') throw new HttpError(400, 'validation', 'variant_id is required', `lines[${i}].variant_id`)
      const quantity = l.quantity === undefined ? 1 : l.quantity
      if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
        throw new HttpError(400, 'validation', 'quantity must be a positive integer', `lines[${i}].quantity`)
      }
      const found = findVariant(l.variant_id)
      if (!found) throw new HttpError(400, 'validation', `Unknown variant ${l.variant_id}`, `lines[${i}].variant_id`)
      const existing = cart?.lines.find((x) => x.variant_id === l.variant_id)
      toCheck.push({ variant: found.variant, quantity: (existing?.quantity ?? 0) + quantity, lineId: existing?.id ?? null, field: `lines[${i}].quantity` })
      return { variant_id: l.variant_id, quantity }
    })
    checkStock(toCheck)
    return out
  }

  /** Visible cap for a variant: only published when the mock's show_stock lets the buyer see it. */
  function visibleMax(variant: ProductVariant): number | null {
    const a = variant.availability
    if (!a || a.status === 'out_of_stock') return 0
    return a.status === 'low_stock' ? a.quantity : null
  }

  function lineProblem(variant: ProductVariant, quantity: number): CartLine['problem'] {
    if (!variant.available_for_sale) return { code: 'out_of_stock', max_quantity: 0 }
    if (variant.quantity_available !== null && quantity > variant.quantity_available) {
      return { code: 'insufficient_stock', max_quantity: visibleMax(variant) }
    }
    return null
  }

  /** Throws one `409 insufficient_stock` listing every affected line; the message never carries quantities. */
  function checkStock(items: { variant: ProductVariant; quantity: number; lineId: string | null; field: string }[]) {
    const bad = items.filter((i) => lineProblem(i.variant, i.quantity))
    if (bad.length === 0) return
    const lines: InsufficientStockLine[] = bad.map((i) => ({
      line_id: i.lineId,
      variant_id: i.variant.id,
      sku: i.variant.sku,
      status: i.variant.availability?.status ?? 'out_of_stock',
      max_quantity: visibleMax(i.variant),
    }))
    throw new HttpError(409, 'insufficient_stock', 'Algunos productos ya no tienen existencias suficientes', bad[0]!.field, { lines })
  }

  function addLines(cart: CartRecord, lines: { variant_id: string; quantity: number }[]) {
    for (const l of lines) {
      const existing = cart.lines.find((x) => x.variant_id === l.variant_id)
      if (existing) existing.quantity += l.quantity
      else cart.lines.push({ id: nextId('line'), variant_id: l.variant_id, quantity: l.quantity })
    }
  }

  const isKnownCode = (code: string) => code.toUpperCase() in discountCodes
  const percentFor = (code: string) => discountCodes[code.toUpperCase()] ?? 0

  function shippingRates(subtotalCents: number) {
    const freeMin = state.shop.policies.free_shipping_min
    const free = freeMin !== null && subtotalCents >= toCents(freeMin.amount)
    return [
      { id: 'flat', title: free ? 'Envío estándar (gratis)' : 'Envío estándar', cost: fromCents(free ? 0 : flatShippingCents, currency), eta: '2 a 5 días hábiles' },
      { id: 'express', title: 'Envío exprés', cost: fromCents(flatShippingCents + 10000, currency), eta: '1 a 2 días hábiles' },
    ]
  }

  function renderCart(cart: CartRecord): Cart {
    const lines: CartLine[] = []
    let subtotal = 0
    let quantity = 0
    for (const l of cart.lines) {
      const found = findVariant(l.variant_id)
      if (!found) continue
      const { product, variant } = found
      const unit = toCents(variant.price.amount)
      subtotal += unit * l.quantity
      quantity += l.quantity
      lines.push({
        id: l.id,
        quantity: l.quantity,
        problem: lineProblem(variant, l.quantity),
        merchandise: {
          ...variant,
          product: { handle: product.handle, title: product.title, featured_image: product.featured_image },
        },
        cost: {
          unit: variant.price,
          total: fromCents(unit * l.quantity, currency),
          compare_at_unit: variant.compare_at_price,
        },
      })
    }
    const codes = cart.codes.map((code) => ({ code, applicable: isKnownCode(code) && subtotal > 0 }))
    const percent = codes.filter((d) => d.applicable).reduce((max, d) => Math.max(max, percentFor(d.code)), 0)
    const discount = Math.round((subtotal * percent) / 100)
    let shipping: number | null = null
    if (cart.delivery.method === 'pickup') shipping = toCents(state.shop.branches.find((b) => b.id === cart.delivery.branch_id)?.pickup?.fee?.amount ?? '0')
    else if (cart.delivery.method === 'shipping' && cart.delivery.rate_id) {
      const rate = shippingRates(subtotal - discount).find((r) => r.id === cart.delivery.rate_id)
      shipping = rate ? toCents(rate.cost.amount) : null
    }
    const total = subtotal - discount + (shipping ?? 0)
    // IVA 16 % included in prices.
    const tax = Math.round(total - total / 1.16)
    return {
      id: cart.id,
      lines,
      total_quantity: quantity,
      discount_codes: codes,
      buyer: { ...cart.buyer },
      shipping_address: cart.shipping_address ? { ...cart.shipping_address } : null,
      delivery: { ...cart.delivery },
      cost: {
        subtotal: fromCents(subtotal, currency),
        discount: fromCents(discount, currency),
        shipping: shipping === null ? null : fromCents(shipping, currency),
        tax: fromCents(tax, currency),
        total: fromCents(total, currency),
        tax_included: true,
      },
      updated_at: cart.updated_at,
    }
  }

  // -------------------------------------------------------------------------
  // Customer helpers
  // -------------------------------------------------------------------------

  function requireCustomer(headers: Headers): Customer {
    const token = headers.get('x-customer-token')
    const id = token ? state.sessions.get(token) : undefined
    const customer = id ? state.customers.find((c) => c.id === id) : undefined
    if (!customer) throw new HttpError(401, 'unauthorized', 'Missing or invalid customer session')
    return customer
  }

  function identifierOf(body: Record<string, unknown>): string {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const phone = typeof body.phone === 'string' ? body.phone.replace(/\s+/g, '') : ''
    if (!email && !phone) throw new HttpError(400, 'validation', 'email or phone is required', 'email')
    if (email && !/^[^@\s]+@[^@\s]+$/.test(email)) throw new HttpError(400, 'validation', 'Invalid email', 'email')
    return email ? `email:${email}` : `phone:${phone}`
  }

  function validateAddress(body: Record<string, unknown>, partial = false): Partial<Address> {
    const required = ['address1', 'city', 'zip', 'country_code'] as const
    if (!partial) {
      for (const f of required) {
        if (typeof body[f] !== 'string' || !(body[f] as string).trim()) throw new HttpError(400, 'validation', `${f} is required`, f)
      }
    }
    const fields = ['first_name', 'last_name', 'company', 'address1', 'address2', 'city', 'province', 'zip', 'country_code', 'phone'] as const
    const out: Partial<Address> = {}
    for (const f of fields) {
      if (f in body) (out as Record<string, unknown>)[f] = body[f] ?? null
      else if (!partial) (out as Record<string, unknown>)[f] = null
    }
    return out
  }

  // -------------------------------------------------------------------------
  // Router
  // -------------------------------------------------------------------------

  type Ctx = {
    method: string
    params: string[]
    search: URLSearchParams
    headers: Headers
    body: Record<string, unknown>
    scopes: Set<string>
  }
  type Result = { status?: number; body?: unknown; cache?: 'public' | 'private'; headers?: Record<string, string> }
  type Route = { method: string; pattern: RegExp; scope: string; handler: (ctx: Ctx) => Result | Promise<Result> }

  const routes: Route[] = []
  const route = (method: string, path: string, scope: string, handler: Route['handler']) => {
    const pattern = new RegExp('^' + path.replace(/:[a-z_]+/g, '([^/]+)') + '$')
    routes.push({ method, pattern, scope, handler })
  }

  const requireNode = <T>(value: T | undefined, what: string, field = 'handle'): T => {
    if (value === undefined) throw new HttpError(404, 'not_found', `${what} not found`, field)
    return value
  }

  // Catalog
  route('GET', '/shop', 'catalog:read', () => ({ body: state.shop, cache: 'public' }))
  route('GET', '/products', 'catalog:read', ({ search }) => ({ body: listProducts(search), cache: 'public' }))
  route('GET', '/products/:handle', 'catalog:read', ({ params }) => ({
    body: requireNode(state.products.find((p) => p.handle === params[0]), `Product ${params[0]}`),
    cache: 'public',
  }))
  route('GET', '/products/:handle/recommendations', 'catalog:read', ({ params }) => {
    const product = requireNode(state.products.find((p) => p.handle === params[0]), `Product ${params[0]}`)
    const cols = state.memberships[product.handle] ?? []
    const nodes = state.products
      .filter((p) => p.id !== product.id && p.available_for_sale && (state.memberships[p.handle] ?? []).some((c) => cols.includes(c)))
      .slice(0, 4)
    return { body: { nodes }, cache: 'public' }
  })
  route('GET', '/collections', 'catalog:read', ({ search }) => ({ body: paginate(state.collections, search), cache: 'public' }))
  route('GET', '/collections/:handle', 'catalog:read', ({ params }) => ({
    body: requireNode(state.collections.find((c) => c.handle === params[0]), `Collection ${params[0]}`),
    cache: 'public',
  }))
  // Locations. `nearest` must be registered before `:id`. Like the real API it rounds the point to 0.01° and keeps nothing.
  const visibleLocations = () => state.shop.branches as Location[]
  const round2 = (n: number) => Math.round(n * 100) / 100
  const withDistance = (origin: { lat: number; lng: number }) =>
    rankByDistance(visibleLocations(), origin).map(({ item, distanceKm }) => ({ ...item, distance_km: Math.round(distanceKm * 10) / 10 }))
  route('GET', '/locations', 'catalog:read', ({ search }) => {
    const cp = search.get('postal_code')
    const origin = cp ? MOCK_POSTAL_CENTROIDS[cp] : undefined
    return { body: { nodes: origin ? withDistance(origin) : visibleLocations() }, cache: 'public' }
  })
  route('GET', '/locations/nearest', 'catalog:read', ({ search }) => {
    const origin = { lat: Number(search.get('lat') ?? NaN), lng: Number(search.get('lng') ?? NaN) }
    if (search.get('lat') === null || search.get('lng') === null || !isValidPoint(origin)) {
      throw new HttpError(400, 'validation', 'lat and lng must be a valid point', 'lat')
    }
    return { body: { nodes: withDistance({ lat: round2(origin.lat), lng: round2(origin.lng) }) }, cache: 'private' }
  })
  route('GET', '/locations/:id', 'catalog:read', ({ params }) => ({
    body: requireNode(visibleLocations().find((b) => b.id === params[0]), `Location ${params[0]}`, 'id'),
    cache: 'public',
  }))
  route('GET', '/stock', 'catalog:read', ({ search }) => {
    const skus = search.getAll('sku')
    if (skus.length > 250) throw new HttpError(400, 'validation', 'At most 250 SKUs', 'sku')
    const nodes = skus.flatMap((sku) => {
      for (const p of state.products) {
        const v = p.variants.find((x) => x.sku === sku)
        if (v) return [{ sku, quantity_available: v.quantity_available, ...(v.availability ? { availability: v.availability } : {}) }]
      }
      return []
    })
    return { body: { nodes }, cache: 'public' }
  })

  // Cart
  route('POST', '/carts', 'cart:write', ({ body }) => {
    const cart: CartRecord = {
      id: nextId('cart'),
      lines: [],
      codes: [],
      buyer: { email: null, phone: null, customer_id: null },
      shipping_address: null,
      delivery: { method: null, rate_id: null, branch_id: null },
      updated_at: now(),
    }
    if (body.lines !== undefined) addLines(cart, validateLines(body.lines))
    state.carts.set(cart.id, cart)
    return { status: 201, body: renderCart(cart), cache: 'private' }
  })
  route('GET', '/carts/:id', 'cart:write', ({ params }) => ({ body: renderCart(getCartRecord(params[0]!)), cache: 'private' }))
  route('POST', '/carts/:id/lines', 'cart:write', ({ params, body }) => {
    const cart = getCartRecord(params[0]!)
    addLines(cart, validateLines(body.lines, cart))
    cart.updated_at = now()
    return { body: renderCart(cart), cache: 'private' }
  })
  route('PATCH', '/carts/:id/lines', 'cart:write', ({ params, body }) => {
    const cart = getCartRecord(params[0]!)
    if (!Array.isArray(body.lines)) throw new HttpError(400, 'validation', '`lines` must be an array', 'lines')
    const updates = body.lines as { id?: unknown; quantity?: unknown }[]
    updates.forEach((u, i) => {
      const line = cart.lines.find((l) => l.id === u.id)
      if (!line) throw new HttpError(400, 'validation', `Unknown line ${String(u.id)}`, `lines[${i}].id`)
      if (typeof u.quantity !== 'number' || !Number.isInteger(u.quantity) || u.quantity < 0) {
        throw new HttpError(400, 'validation', 'quantity must be a non-negative integer', `lines[${i}].quantity`)
      }
    })
    checkStock(
      updates.flatMap((u, i) => {
        const line = cart.lines.find((l) => l.id === u.id)!
        return (u.quantity as number) > 0
          ? [{ variant: findVariant(line.variant_id)!.variant, quantity: u.quantity as number, lineId: line.id, field: `lines[${i}].quantity` }]
          : []
      }),
    )
    for (const u of updates) {
      const line = cart.lines.find((l) => l.id === u.id)!
      line.quantity = u.quantity as number
    }
    cart.lines = cart.lines.filter((l) => l.quantity > 0)
    cart.updated_at = now()
    return { body: renderCart(cart), cache: 'private' }
  })
  route('PUT', '/carts/:id/discount-codes', 'cart:write', ({ params, body }) => {
    const cart = getCartRecord(params[0]!)
    if (!Array.isArray(body.codes) || body.codes.some((c) => typeof c !== 'string')) {
      throw new HttpError(400, 'validation', '`codes` must be an array of strings', 'codes')
    }
    cart.codes = [...new Set((body.codes as string[]).map((c) => c.trim().toUpperCase()).filter(Boolean))]
    cart.updated_at = now()
    return { body: renderCart(cart), cache: 'private' }
  })
  route('PUT', '/carts/:id/buyer', 'cart:write', ({ params, body, headers }) => {
    const cart = getCartRecord(params[0]!)
    const email = typeof body.email === 'string' ? body.email.trim() : null
    const phone = typeof body.phone === 'string' ? body.phone.trim() : null
    if (email && !/^[^@\s]+@[^@\s]+$/.test(email)) throw new HttpError(400, 'validation', 'Invalid email', 'email')
    const token = headers.get('x-customer-token')
    const customerId = token ? (state.sessions.get(token) ?? null) : null
    cart.buyer = { email: email || null, phone: phone || null, customer_id: customerId }
    cart.updated_at = now()
    return { body: renderCart(cart), cache: 'private' }
  })
  route('PUT', '/carts/:id/shipping-address', 'cart:write', ({ params, body }) => {
    const cart = getCartRecord(params[0]!)
    cart.shipping_address = validateAddress(body) as Address
    cart.updated_at = now()
    return { body: renderCart(cart), cache: 'private' }
  })
  route('GET', '/carts/:id/delivery-options', 'cart:write', ({ params }) => {
    const cart = renderCart(getCartRecord(params[0]!))
    const net = toCents(cart.cost.subtotal.amount) - toCents(cart.cost.discount.amount)
    return {
      body: { rates: shippingRates(net), pickup: state.shop.branches.filter((b) => b.pickup?.enabled !== false).map((b) => ({ branch_id: b.id, name: b.name, address: b.address, city: b.city })), partial: false, unavailable: [] },
      cache: 'private',
    }
  })
  route('GET', '/carts/:id/payment-methods', 'cart:write', ({ params }) => {
    getCartRecord(params[0]!)
    return { body: { methods: [{ key: 'mock', kind: 'builtin', default: true }], market: null }, cache: 'private' }
  })
  route('PUT', '/carts/:id/delivery', 'cart:write', ({ params, body }) => {
    const cart = getCartRecord(params[0]!)
    if (body.method === 'shipping') {
      const rateId = body.rate_id
      if (typeof rateId !== 'string' || !shippingRates(0).some((r) => r.id === rateId)) {
        throw new HttpError(400, 'validation', 'Unknown rate_id', 'rate_id')
      }
      cart.delivery = { method: 'shipping', rate_id: rateId, branch_id: null }
    } else if (body.method === 'pickup') {
      const branchId = body.branch_id
      if (typeof branchId !== 'string' || !state.shop.branches.some((b) => b.id === branchId && b.pickup?.enabled !== false)) {
        throw new HttpError(400, 'validation', 'Unknown branch_id', 'branch_id')
      }
      cart.delivery = { method: 'pickup', rate_id: null, branch_id: branchId }
    } else {
      throw new HttpError(400, 'validation', 'method must be shipping or pickup', 'method')
    }
    cart.updated_at = now()
    return { body: renderCart(cart), cache: 'private' }
  })
  route('POST', '/carts/:id/checkout', 'checkout:write', ({ params, body, headers }) => {
    const key = headers.get('idempotency-key')
    if (key) {
      const prev = state.idempotency.get(`${params[0]}:${key}`)
      if (prev) return { status: prev.status, body: prev.body, cache: 'private' }
    }
    const record = getCartRecord(params[0]!)
    const cart = renderCart(record)
    if (cart.lines.length === 0) throw new HttpError(422, 'invalid_state', 'Cart is empty', 'lines')
    if (!cart.buyer.email && !cart.buyer.phone) throw new HttpError(422, 'invalid_state', 'Buyer email or phone is required', 'buyer')
    if (!cart.delivery.method) throw new HttpError(422, 'invalid_state', 'Delivery method is required', 'delivery')
    if (cart.delivery.method === 'shipping' && !cart.shipping_address) {
      throw new HttpError(422, 'invalid_state', 'Shipping address is required', 'shipping_address')
    }
    if (typeof body.payment_method !== 'string' || !body.payment_method) throw new HttpError(400, 'validation', 'payment_method is required', 'payment_method')
    if (typeof body.return_url !== 'string' || !body.return_url) throw new HttpError(400, 'validation', 'return_url is required', 'return_url')
    // Reserve stock.
    checkStock(record.lines.map((l, i) => ({ variant: findVariant(l.variant_id)!.variant, quantity: l.quantity, lineId: l.id, field: `lines[${i}].quantity` })))
    for (const l of record.lines) {
      const v = findVariant(l.variant_id)!.variant
      if (v.quantity_available !== null) {
        v.quantity_available -= l.quantity
        v.available_for_sale = v.quantity_available > 0
      }
    }
    syncAvailability(state.products)

    const orderId = nextId('ord')
    const number = String(1001 + state.orders.length - 1)
    const customerId = cart.buyer.customer_id ?? state.customers.find((c) => c.email && c.email === cart.buyer.email)?.id ?? null
    state.orders.push({
      id: orderId,
      number,
      status: 'pending_payment',
      created_at: now(),
      total: cart.cost.total,
      customer_id: customerId,
      lines: cart.lines.map((l) => ({
        title: l.merchandise.product.title,
        variant_title: l.merchandise.title,
        sku: l.merchandise.sku,
        quantity: l.quantity,
        unit: l.cost.unit,
        total: l.cost.total,
        image: l.merchandise.image ?? l.merchandise.product.featured_image,
      })),
    })
    const redirect = new URL(`https://mock.local/pay/${orderId}`)
    redirect.searchParams.set('return_url', body.return_url)
    const checkoutId = nextId('chk')
    const result = {
      order: { id: orderId, number },
      payment: { provider: 'mock', status: 'pending', redirect_url: redirect.toString(), client_secret: null, instructions: null },
      checkout: {
        id: checkoutId,
        status: 'pending',
        external_order_id: orderId,
        total: cart.cost.total,
        stock_hold_expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      },
    }
    state.checkouts.set(checkoutId, result)
    if (key) state.idempotency.set(`${params[0]}:${key}`, { status: 201, body: result })
    return { status: 201, body: result, cache: 'private' }
  })
  route('GET', '/checkouts/:id', 'checkout:write', ({ params }) => {
    const found = state.checkouts.get(params[0]!)
    if (!found) throw new HttpError(404, 'not_found', 'Checkout not found')
    return { body: found, cache: 'private' }
  })

  // Restock subscriptions ("notify me when it is back")
  route('POST', '/restock-subscriptions', 'customer:write', ({ body }) => {
    if (typeof body.sku !== 'string' || !body.sku) throw new HttpError(400, 'validation', 'sku is required', 'sku')
    if (typeof body.locale !== 'string' || !body.locale) throw new HttpError(400, 'validation', 'locale is required', 'locale')
    if (body.consent !== true) throw new HttpError(422, 'invalid_state', 'consent must be true', 'consent')
    const contact = typeof body.email === 'string' && body.email ? body.email.toLowerCase() : typeof body.phone === 'string' ? body.phone : ''
    if (!contact) throw new HttpError(400, 'validation', 'email or phone is required', 'email')
    const known = state.products.some((p) => p.variants.some((v) => v.sku === body.sku))
    if (!known) throw new HttpError(404, 'not_found', `SKU ${body.sku} not found`, 'sku')
    state.restock.add(`${contact}|${body.sku}`)
    return { status: 202, body: { status: 'pending' }, cache: 'private' }
  })

  // Customer
  route('POST', '/customer/otp', 'customer:write', ({ body }) => {
    state.otps.set(identifierOf(body), otpCode)
    return { status: 204 }
  })
  route('POST', '/customer/session', 'customer:write', ({ body }) => {
    const id = identifierOf(body)
    if (typeof body.code !== 'string' || state.otps.get(id) !== body.code) {
      throw new HttpError(401, 'unauthorized', 'Invalid or expired code', 'code')
    }
    state.otps.delete(id)
    const [kind, value] = id.split(/:(.*)/s) as [string, string]
    let customer = state.customers.find((c) => (kind === 'email' ? c.email === value : c.phone === value))
    if (!customer) {
      customer = {
        id: nextId('cus'),
        email: kind === 'email' ? value : null,
        phone: kind === 'phone' ? value : null,
        first_name: null,
        last_name: null,
        default_address_id: null,
        created_at: now(),
      }
      state.customers.push(customer)
    }
    const token = `ct_${customer.id}_${Math.random().toString(36).slice(2)}`
    state.sessions.set(token, customer.id)
    return {
      status: 201,
      body: { token, expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), customer },
      cache: 'private',
    }
  })
  route('GET', '/customer', 'customer:read', ({ headers }) => ({ body: requireCustomer(headers), cache: 'private' }))
  const stripOrder = ({ customer_id: _c, ...o }: MockState['orders'][number]): Order => o
  route('GET', '/customer/orders', 'orders:read', ({ headers, search }) => {
    const c = requireCustomer(headers)
    const orders = state.orders.filter((o) => o.customer_id === c.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(stripOrder)
    return { body: paginate(orders, search, 20), cache: 'private' }
  })
  const findOrder = (headers: Headers, id: string) => {
    const c = requireCustomer(headers)
    return requireNode(state.orders.find((o) => o.id === id && o.customer_id === c.id), `Order ${id}`, 'id')
  }
  route('GET', '/customer/orders/:id', 'orders:read', ({ headers, params }) => ({ body: stripOrder(findOrder(headers, params[0]!)), cache: 'private' }))
  route('POST', '/customer/orders/:id/returns', 'customer:write', ({ headers, params, body }) => {
    const order = findOrder(headers, params[0]!)
    if (!Array.isArray(body.lines) || body.lines.length === 0) throw new HttpError(400, 'validation', 'lines are required', 'lines')
    return { status: 201, body: { id: nextId('ret'), order_id: order.id, status: 'requested' }, cache: 'private' }
  })
  route('POST', '/customer/orders/:id/invoice', 'customer:write', ({ headers, params }) => {
    findOrder(headers, params[0]!)
    return { status: 202, body: { status: 'requested', url: null }, cache: 'private' }
  })
  route('GET', '/customer/addresses', 'customer:read', ({ headers }) => {
    const c = requireCustomer(headers)
    return { body: { nodes: state.addresses.get(c.id) ?? [] }, cache: 'private' }
  })
  route('POST', '/customer/addresses', 'customer:write', ({ headers, body }) => {
    const c = requireCustomer(headers)
    const address = { ...(validateAddress(body) as Address), id: nextId('addr') }
    state.addresses.set(c.id, [...(state.addresses.get(c.id) ?? []), address])
    if (!c.default_address_id) c.default_address_id = address.id
    return { status: 201, body: address, cache: 'private' }
  })
  route('PATCH', '/customer/addresses/:id', 'customer:write', ({ headers, params, body }) => {
    const c = requireCustomer(headers)
    const list = state.addresses.get(c.id) ?? []
    const idx = list.findIndex((a) => a.id === params[0])
    if (idx < 0) throw new HttpError(404, 'not_found', 'Address not found', 'id')
    const updated = { ...list[idx]!, ...validateAddress(body, true), id: list[idx]!.id }
    list[idx] = updated
    return { body: updated, cache: 'private' }
  })
  route('DELETE', '/customer/addresses/:id', 'customer:write', ({ headers, params }) => {
    const c = requireCustomer(headers)
    const list = state.addresses.get(c.id) ?? []
    if (!list.some((a) => a.id === params[0])) throw new HttpError(404, 'not_found', 'Address not found', 'id')
    state.addresses.set(c.id, list.filter((a) => a.id !== params[0]))
    if (c.default_address_id === params[0]) c.default_address_id = null
    return { status: 204 }
  })

  // Content
  const previewCache = (search: URLSearchParams): 'public' | 'private' => (search.has('preview') ? 'private' : 'public')
  route('GET', '/content/theme', 'content:read', () => ({ body: state.theme, cache: 'public' }))
  route('GET', '/content/pages/:handle', 'content:read', ({ params, search }) => {
    const page = requireNode(state.pages.find((p) => p.handle === params[0]), `Page ${params[0]}`)
    const body = search.has('preview') ? { ...page, title: `${page.title} (borrador)` } : page
    return { body, cache: previewCache(search) }
  })
  route('GET', '/content/menus/:handle', 'content:read', ({ params }) => ({
    body: requireNode(state.menus.find((m) => m.handle === params[0]), `Menu ${params[0]}`),
    cache: 'public',
  }))
  route('GET', '/content/articles', 'content:read', ({ search }) => {
    let items = state.articles.slice().sort((a, b) => b.published_at.localeCompare(a.published_at))
    const tag = search.get('tag')
    if (tag) items = items.filter((a) => a.tags.includes(tag))
    const q = search.get('q')?.toLowerCase()
    if (q) items = items.filter((a) => `${a.title} ${a.excerpt ?? ''}`.toLowerCase().includes(q))
    return { body: paginate(items, search, 10, 50), cache: 'public' }
  })
  route('GET', '/content/articles/:handle', 'content:read', ({ params, search }) => ({
    body: requireNode(state.articles.find((a) => a.handle === params[0]), `Article ${params[0]}`),
    cache: previewCache(search),
  }))

  // -------------------------------------------------------------------------
  // fetch
  // -------------------------------------------------------------------------

  function scopesFor(token: string | null): Set<string> | null {
    if (!token) return null
    if (token.startsWith('pk_')) return new Set(['catalog:read', 'content:read', 'cart:write'])
    if (token.startsWith('sk_')) return new Set(['catalog:read', 'content:read', 'cart:write', 'checkout:write', 'customer:read', 'customer:write', 'orders:read'])
    return null
  }

  function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return new Response(status === 204 || body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
    })
  }

  function errorResponse(err: HttpError): Response {
    return json(
      err.status,
      { error: { code: err.code, message: err.message, ...(err.field ? { field: err.field } : {}), ...(err.details !== undefined ? { details: err.details } : {}) } },
      { 'Cache-Control': PRIVATE_CACHE },
    )
  }

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const idx = url.pathname.indexOf('/storefront/')
    if (idx < 0) return errorResponse(new HttpError(404, 'not_found', `No route for ${url.pathname}`))
    const path = url.pathname.slice(idx + '/storefront'.length).replace(/\/+$/, '') || '/'
    const method = request.method.toUpperCase()

    const matching = routes.filter((r) => r.pattern.test(path))
    if (matching.length === 0) return errorResponse(new HttpError(404, 'not_found', `No route for ${method} ${path}`))
    const r = matching.find((x) => x.method === method)
    if (!r) return json(405, { error: { code: 'method_not_allowed', message: `${method} not allowed on ${path}` } }, { Allow: matching.map((x) => x.method).join(', ') })

    const auth = request.headers.get('authorization')
    const token = auth?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null
    const scopes = scopesFor(token)
    if (!scopes) return errorResponse(new HttpError(401, 'unauthorized', 'Missing or invalid storefront token'))
    if (enforceScopes && !scopes.has(r.scope)) return errorResponse(new HttpError(403, 'forbidden', `Token lacks scope ${r.scope}`))

    let body: Record<string, unknown> = {}
    if (method !== 'GET' && method !== 'DELETE') {
      const text = await request.text()
      if (text) {
        try {
          const parsed: unknown = JSON.parse(text)
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object')
          body = parsed as Record<string, unknown>
        } catch {
          return errorResponse(new HttpError(400, 'validation', 'Body must be a JSON object'))
        }
      }
    }

    const params = (r.pattern.exec(path) ?? []).slice(1).map((p) => decodeURIComponent(p))
    try {
      const result = await r.handler({ method, params, search: url.searchParams, headers: request.headers, body, scopes })
      const status = result.status ?? 200
      const headers: Record<string, string> = { ...result.headers }
      if (result.cache === 'public') headers['Cache-Control'] = PUBLIC_CACHE
      if (result.cache === 'private') headers['Cache-Control'] = PRIVATE_CACHE
      if (method === 'GET' && result.cache === 'public' && status === 200) {
        const etag = `W/"${fnv1a(JSON.stringify(result.body))}"`
        headers.ETag = etag
        if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })
      }
      return json(status, result.body, headers)
    } catch (err) {
      if (err instanceof HttpError) return errorResponse(err)
      return json(500, { error: { code: 'server_error', message: err instanceof Error ? err.message : 'Internal error' } })
    }
  }

  const mockFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (options.latencyMs) await new Promise((r) => setTimeout(r, options.latencyMs))
    const request = input instanceof Request && !init ? input : new Request(input instanceof Request ? input.url : String(input), init)
    if (request.signal?.aborted) throw request.signal.reason ?? new DOMException('Aborted', 'AbortError')
    return handle(request)
  }

  return {
    /** Drop-in `fetch` serving `/storefront/*` from memory. */
    fetch: mockFetch,
    /** Live in-memory state (mutable; useful in tests). */
    get state(): Readonly<MockState> {
      return state
    },
    /** Restores the seed data and clears carts, sessions and orders. */
    reset() {
      state = seed()
      syncAvailability(state.products)
    },
    /** OTP code accepted by `/customer/session`. */
    otpCode,
  }
}

export type MockStorefront = ReturnType<typeof createMockStorefront>
