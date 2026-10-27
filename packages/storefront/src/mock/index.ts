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
  CartRecommendation,
  Collection,
  Customer,
  CustomerCapabilities,
  CustomerSession,
  FiscalIdentity,
  FiscalProfile,
  FiscalProfileInput,
  InvoiceRequest,
  InvoiceDoc,
  InvoiceFile,
  InvoiceStage,
  InvoiceSummary,
  Facet,
  Location,
  Menu,
  Order,
  PendingPayment,
  Page,
  PaymentAttemptResult,
  PaymentConfig,
  PaymentMethod,
  Product,
  ProductVariant,
  PromotionAnnouncement,
  Region,
  AddressSuggestion,
  ShippingRate,
  Shop,
  StorefrontErrorCode,
  Subject,
  SubjectKind,
  Theme,
} from '../types.js'
import { nextAction, orderProgress, orderShipments, shipmentsStatus, sortTrackingEvents, isTestShipment } from '../order-progress.js'
import { isValidPoint, rankByDistance } from '../geo.js'
import { resolveAvailability } from '../availability.js'
import { buildAccountOrders, buildPendingPayments, buildSyntheticOrders } from './account-seed.js'
import { MOCK_REGION_MX, maskTaxId, validateInvoiceRequest } from './region.js'
import { isMasked, PRIVATE_MASK, resolveSubject, type SubjectValues } from '../subjects.js'
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
export { MOCK_SUBJECT_KINDS } from './subjects.js'
export { MOCK_CSF_RULES, MOCK_FISCAL_ID_MX, MOCK_IDENTITY_DOCUMENT_MX_CSF, MOCK_REGION_MX } from './region.js'
export type { MockImageUrl } from './seed.js'

export type MockStorefrontOptions = {
  /** Currency for all prices (default `MXN`). */
  currency?: string
  /** Image URL builder for seed data (default: picsum.photos placeholders). */
  imageUrl?: MockImageUrl
  /** OTP code accepted by `/customer/session` (default `000000`). */
  otpCode?: string
  /**
   * What `GET /customer/capabilities` reports (default `{ password: true, email_verification: true, otp_channels: ['email'] }`).
   * `password: false` makes register / login / password routes answer `403`; `email_verification: false` makes `register`
   * create the account straight away (`201`).
   */
  customerCapabilities?: Partial<CustomerCapabilities>
  /**
   * Scopes the mock's `sk_`/`pk_` tokens do NOT have (e.g. `['customer:write']`), to rehearse an under-provisioned
   * store. Routes needing one answer `403 insufficient_scope` with `required_scopes`; `GET /_token` lists them in
   * `missing_scopes`; and `customer/capabilities` reports `password: false`, `unavailable_reason: 'missing_scope'`
   * when `customer:write` is among them. Implies scope enforcement.
   */
  missingScopes?: string[]
  /**
   * How many MORE orders the demo buyer (`cus_1`) has, numbered `S0001`…, to rehearse a long history (paging, filters,
   * a B2B buyer with hundreds of orders). Default 0.
   */
  syntheticOrders?: number
  /** Failed password logins per email before `429 rate_limited` (default 5; a success or a reset clears the count). */
  maxLoginAttempts?: number
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
  /** Entry pop-up announcements served by `GET /storefront/promotions` (default none). */
  announcements?: PromotionAnnouncement[]
  /** Payment attempts allowed per checkout before `429 too_many_attempts` (default 5). */
  maxPaymentAttempts?: number
  /**
   * Carrier-style rates served by `delivery-options` instead of the flat / express pair (to design a checkout with
   * carriers, ETAs and quote deadlines). `expires_at` missing: 24 h from the request. Free shipping still applies.
   */
  shippingRates?: ShippingRate[]
  /**
   * `fixed_when_free`: past `policies.free_shipping_min` `delivery-options` serves ONLY the shop's free rate and flags
   * `free` / `fixed` (what the `storefront_cart` addon does with the setting of the same name). Default: the usual list.
   */
  shippingQuoteMode?: 'carriers' | 'fixed_when_free'
  /** Methods served by `payment-methods` (default one builtin `mock`). */
  paymentMethods?: PaymentMethod[]
  /**
   * What `GET /storefront/region` serves (default `MOCK_REGION_MX`, with its `MX:csf` identity document). `null`: the
   * organization has no region, the route answers `404` and invoice requests are not validated against a region.
   */
  region?: Region | null
  /**
   * What `GET /storefront/address/suggest` can answer (matched by `label` containing the typed text). Default: none, so
   * the route answers `{ suggestions: [], available: false }` like a market without a suggestion provider and address
   * forms stay manual.
   */
  addressSuggestions?: AddressSuggestion[]
  /**
   * The kinds of buyer item («My items») the store declares, served by `GET /subject-kinds` and enforced by
   * `customer.subjects`. Default none: no such section, as in a store that declares nothing (`MOCK_SUBJECT_KINDS` has two).
   */
  subjectKinds?: SubjectKind[]
}

type CartRecord = {
  id: string
  lines: { id: string; variant_id: string; quantity: number }[]
  codes: string[]
  buyer: Cart['buyer']
  shipping_address: Address | null
  delivery: Cart['delivery']
  note: string | null
  /** Invoice asked for (`PUT /carts/:id/invoice`). */
  invoice: InvoiceRequest | null
  checkedOut: boolean
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
  /** Saved fiscal profiles by customer id (contract 1.9). */
  fiscalProfiles: Map<string, FiscalProfile[]>
  /** Saved items by customer id (contract 1.9); `private` holds the values the API only returns masked. */
  subjects: Map<string, (Subject & { private: Record<string, string> })[]>
  orders: (Order & { customer_id: string | null })[]
  otps: Map<string, string>
  /** Email → password (plain text: it is a mock). The seed customer starts without one. */
  passwords: Map<string, string>
  /** Registrations waiting for their code, by email. */
  pendingRegistrations: Map<string, { password: string; first_name: string | null; last_name: string | null }>
  /** Consecutive failed password logins by email. */
  loginFailures: Map<string, number>
  sessions: Map<string, string>
  /** What «Devices» shows for each session token (contract 1.9). */
  sessionInfo: Map<string, { id: string; customer_id: string; created_at: string; last_used_at: string; login_method: string; reauth_at: number | null }>
  /** Wrong re-authentications per customer (5 and the mock answers 429). */
  reauthFailures: Map<string, number>
  /** Data exports served per customer (3 a day). */
  exportsServed: Map<string, number>
  /** Tokens of accounts that were deleted: deleting again answers 204, as the server does. */
  deletedTokens: Set<string>
  idempotency: Map<string, { status: number; body: unknown }>
  checkouts: Map<string, unknown>
  /** Payment attempts per checkout (`n`, last result). */
  payments: Map<string, { attempts: number; last: PaymentAttemptResult | null }>
  /** `contact|sku` of accepted "notify me" subscriptions. */
  restock: Set<string>
  /** Cash vouchers waiting for payment (`GET /customer/pending-payments`); `cus_1` only. */
  pendingPayments: PendingPayment[]
  /** Invoice requested per order id. */
  invoices: Map<string, { stage: InvoiceStage; request: InvoiceRequest }>
  seq: number
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: StorefrontErrorCode,
    message: string,
    readonly field?: string,
    readonly details?: unknown,
    readonly requiredScopes?: string[],
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
  const capabilities: CustomerCapabilities = {
    password: true,
    email_verification: true,
    otp_channels: ['email'],
    invoicing: {
      available: true,
      countries: ['MX'],
      checkout: 'optional',
      post_purchase: true,
      window_days: 30,
      identity_documents: ['MX:csf'],
      online_verify: false,
    },
    fiscal_profiles: { max: 10 },
    notifications: { channels: ['email'] },
    data_export: true,
    account_delete: true,
    email_change: true,
    ...((options.subjectKinds?.length ?? 0) > 0 ? { subjects: { kinds: options.subjectKinds!.map((k) => k.key), share_with_workshop: false } } : {}),
    ...options.customerCapabilities,
  }
  const missingScopes = options.missingScopes ?? []
  if (missingScopes.includes('customer:write')) {
    capabilities.password = false
    capabilities.unavailable_reason = 'missing_scope'
    capabilities.missing_scopes = ['customer:write']
  }
  const region = options.region === undefined ? MOCK_REGION_MX : options.region
  const maxLoginAttempts = options.maxLoginAttempts ?? 5
  const MIN_PASSWORD = 10
  const MAX_PASSWORD = 128
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
      fiscalProfiles: new Map(),
      subjects: new Map(),
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
        ...buildAccountOrders(currency),
        ...buildSyntheticOrders(options.syntheticOrders ?? 0, currency),
      ],
      pendingPayments: buildPendingPayments(currency, Date.now()),
      otps: new Map(),
      passwords: new Map(),
      pendingRegistrations: new Map(),
      loginFailures: new Map(),
      sessions: new Map(),
      sessionInfo: new Map(),
      reauthFailures: new Map(),
      exportsServed: new Map(),
      deletedTokens: new Set(),
      idempotency: new Map(),
      checkouts: new Map(),
      payments: new Map(),
      restock: new Set(),
      invoices: new Map(),
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

    // `tags_any` (contract 1.9) is a hard filter of the base set: facets count inside it, nothing relaxes it.
    const tagsAny = (search.get('tags_any') ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
    if (tagsAny.length > 5 || tagsAny.some((t) => t.length > 120)) throw new HttpError(400, 'validation', 'tags_any takes at most 5 tags of 120 characters', 'tags_any')
    if (tagsAny.length > 0) items = items.filter((p) => p.tags.some((t) => tagsAny.includes(t.toLowerCase())))

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

  function shippingRates(subtotalCents: number): ShippingRate[] {
    const freeMin = state.shop.policies.free_shipping_min
    const free = freeMin !== null && subtotalCents >= toCents(freeMin.amount)
    if (options.shippingRates?.length) {
      const expires = new Date(Date.now() + 24 * 3_600_000).toISOString()
      return options.shippingRates.map((r) => ({ ...r, expires_at: r.expires_at ?? expires, cost: free ? fromCents(0, r.cost.currency_code) : r.cost }))
    }
    // Like the server with `shipping_quote_mode: fixed_when_free`: past the free-shipping minimum the shop's own price is
    // the only rate (no carrier is asked, there is nothing to choose).
    if (free && options.shippingQuoteMode === 'fixed_when_free') return [{ id: 'flat', title: 'Envío gratis', cost: fromCents(0, currency), eta: '2 a 5 días hábiles' }]
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
      note: cart.note,
      invoice: cart.invoice ? cartInvoiceOf(cart.invoice) : null,
      updated_at: cart.updated_at,
    }
  }

  function cartInvoiceOf(inv: InvoiceRequest): NonNullable<Cart['invoice']> {
    const taxId = typeof inv.tax_id === 'string' ? inv.tax_id : typeof inv.rfc === 'string' ? inv.rfc : ''
    const name = typeof inv.legal_name === 'string' ? inv.legal_name : typeof inv.razon_social === 'string' ? inv.razon_social : null
    return {
      requested: true,
      tax_id_masked: taxId ? maskTaxId(taxId) : null,
      legal_name: name,
      country_code: inv.country_code ?? region?.country_code ?? null,
      document_kind: inv.document?.kind ?? null,
    }
  }

  /** `null` for "no invoice" (absent, `requested: false`), the request when it is valid, a 422 `invoice.<field>` otherwise. */
  function parseInvoice(raw: unknown, prefix = 'invoice'): InvoiceRequest | null {
    if (raw === null || raw === undefined) return null
    if (typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'validation', 'invoice must be an object', prefix)
    const inv = raw as InvoiceRequest
    if (inv.requested === false) return null
    const problem = validateInvoiceRequest(region, inv, prefix)
    if (problem) throw new HttpError(422, 'invalid_state', problem.message, problem.field)
    return inv
  }

  const orderInvoice = (order: MockState['orders'][number]): InvoiceSummary => {
    const doc = order.invoices?.find((d) => d.kind === 'invoice')
    if (doc) {
      // Seeded document: the summary says what the document says, with no link (the file comes from `invoiceFile`).
      const { id: _id, kind: _k, total: _t, issued_at: _i, cancelled_at: _c, series: _s, folio_number: _f, related_to: _r, links_expire_at: _l, test_mode: _tm, environment: _e, ...summary } = doc
      return { ...summary, url: null, xml_url: null }
    }
    const entry = state.invoices.get(order.id)
    const paid = order.status !== 'pending_payment'
    if (entry) {
      const stage: InvoiceStage = entry.stage === 'awaiting_payment' && paid ? 'queued' : entry.stage
      return { stage, requested: true, status: stage === 'issued' ? 'issued' : 'requested', action: stage === 'awaiting_payment' ? 'wait' : 'none', can_request: false, url: null, xml_url: null }
    }
    return paid
      ? { status: 'not_requested', stage: 'not_requested', requested: false, action: 'request', can_request: true, blocked_reason: null }
      : { status: 'not_requested', stage: 'not_requested', requested: false, action: 'none', can_request: false, blocked_reason: 'awaiting_payment' }
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

  function emailOf(body: Record<string, unknown>): string {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) throw new HttpError(400, 'validation', 'Invalid email', 'email')
    return email
  }

  function passwordOf(body: Record<string, unknown>, field = 'password'): string {
    const value = body[field]
    if (typeof value !== 'string' || value.length < MIN_PASSWORD || value.length > MAX_PASSWORD) {
      throw new HttpError(400, 'validation', `${field} must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters`, field)
    }
    return value
  }

  function requirePasswordEnabled() {
    if (!capabilities.password) throw new HttpError(403, 'forbidden', 'Password accounts are disabled for this store')
  }

  function sessionFor(email: string, extra: { first_name?: string | null; last_name?: string | null } = {}): CustomerSession {
    let customer = state.customers.find((c) => c.email === email)
    if (!customer) {
      customer = {
        id: nextId('cus'),
        email,
        phone: null,
        first_name: extra.first_name ?? null,
        last_name: extra.last_name ?? null,
        default_address_id: null,
        created_at: now(),
        // Registered with no mail connector: the e-mail is only a login name until a code proves it.
        email_verified: capabilities.email_verification,
      }
      state.customers.push(customer)
    }
    const token = `ct_${customer.id}_${Math.random().toString(36).slice(2)}`
    state.sessions.set(token, customer.id)
    trackSession(token, 'password')
    return { token, expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), customer }
  }

  function trackSession(token: string, loginMethod: string) {
    const at = now()
    state.sessionInfo.set(token, { id: nextId('ses'), customer_id: state.sessions.get(token) ?? '', created_at: at, last_used_at: at, login_method: loginMethod, reauth_at: null })
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
  route('GET', '/region', 'catalog:read', () => {
    if (!region) throw new HttpError(404, 'not_found', 'No region configured')
    return { body: region, cache: 'public' }
  })
  route('GET', '/address/suggest', 'catalog:read', ({ search }) => {
    const q = (search.get('q') ?? '').trim().replace(/\s+/g, ' ')
    if ([...q].length < 3) throw new HttpError(400, 'validation', 'q needs at least 3 characters', 'q')
    const pool = options.addressSuggestions
    if (!pool) return { body: { suggestions: [], available: false }, cache: 'private' }
    const fold = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const country = search.get('country')?.toUpperCase()
    const zip = search.get('zip')?.trim()
    const limit = Math.min(Math.max(Number(search.get('limit')) || 5, 1), 8)
    const hits = pool.filter((p) => fold(p.label).includes(fold(q)) && (!country || p.country === country) && (!zip || !p.zip || p.zip === zip))
    return { body: { suggestions: hits.slice(0, limit), available: true }, cache: 'private' }
  })
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
      note: null,
      invoice: null,
      checkedOut: false,
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
    const rates = shippingRates(net)
    const free = options.shippingQuoteMode === 'fixed_when_free' && rates.length > 0 && rates.every((r) => toCents(r.cost.amount) === 0)
    return {
      body: { rates, free, fixed: free, pickup: state.shop.branches.filter((b) => b.pickup?.enabled !== false).map((b) => ({ branch_id: b.id, name: b.name, address: b.address, city: b.city })), partial: false, unavailable: [] },
      cache: 'private',
    }
  })
  route('GET', '/carts/:id/payment-methods', 'cart:write', ({ params }) => {
    getCartRecord(params[0]!)
    return { body: { methods: options.paymentMethods ?? [{ key: 'mock', kind: 'builtin', default: true }], market: null }, cache: 'private' }
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
  route('PUT', '/carts/:id/invoice', 'cart:write', ({ params, body }) => {
    const cart = getCartRecord(params[0]!)
    if (cart.checkedOut) throw new HttpError(409, 'already_checked_out', 'The cart is already an order')
    cart.invoice = parseInvoice(body)
    cart.updated_at = now()
    return { body: renderCart(cart), cache: 'private' }
  })
  // Order note, cross-sell and promotions (contract 1.2)
  route('PUT', '/carts/:id/note', 'cart:write', ({ params, body }) => {
    const cart = getCartRecord(params[0]!)
    const raw = body.note
    if (raw !== null && raw !== undefined && typeof raw !== 'string') throw new HttpError(400, 'validation', 'note must be a string or null', 'note')
    const text = typeof raw === 'string' ? raw.trim() : ''
    if (text.length > 1000) throw new HttpError(400, 'validation', 'note must be at most 1000 characters', 'note')
    cart.note = text || null
    cart.updated_at = now()
    return { body: renderCart(cart), cache: 'private' }
  })
  route('GET', '/carts/:id/recommendations', 'cart:write', ({ params, search }) => {
    const cart = getCartRecord(params[0]!)
    const first = Math.min(8, Math.max(1, Number.parseInt(search.get('first') ?? '4', 10) || 4))
    const inCart = new Set(cart.lines.map((l) => findVariant(l.variant_id)?.product.id))
    const nodes: CartRecommendation[] = []
    for (const p of state.products) {
      if (inCart.has(p.id)) continue
      const variants = p.variants.filter((v) => v.available_for_sale)
      if (variants.length === 0) continue
      nodes.push({
        product: { id: p.id, handle: p.handle, title: p.title, featured_image: p.featured_image, options: p.options, vendor: p.vendor },
        variants,
        default_variant_id: variants[0]!.id,
        source: 'similar',
        unlocks: null,
      })
      if (nodes.length >= first) break
    }
    return { body: { nodes, promotions: null }, cache: 'private' }
  })
  route('GET', '/promotions', 'catalog:read', () => ({
    body: { nodes: [], announcements: options.announcements ?? [] },
    cache: 'public',
  }))

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
    // The invoice is checked against the region BEFORE anything is reserved or charged.
    const invoice = body.invoice !== undefined ? parseInvoice(body.invoice) : record.invoice
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
    const number = String(Math.max(1000, ...state.orders.map((o) => Number(o.number) || 0)) + 1)
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
    record.checkedOut = true
    if (invoice) state.invoices.set(orderId, { stage: 'awaiting_payment', request: invoice })
    if (key) state.idempotency.set(`${params[0]}:${key}`, { status: 201, body: result })
    return { status: 201, body: result, cache: 'private' }
  })
  route('GET', '/checkouts/:id', 'checkout:write', ({ params }) => {
    const found = state.checkouts.get(params[0]!)
    if (!found) throw new HttpError(404, 'not_found', 'Checkout not found')
    return { body: found, cache: 'private' }
  })

  // Embedded payment (contract 1.2). The result depends on the provider token, like the sandbox cardholder names.
  const DECLINES: Record<string, NonNullable<PaymentAttemptResult['payment']['decline_code']>> = {
    tok_OTHE: 'declined',
    tok_CALL: 'call_issuer',
    tok_FUND: 'insufficient_funds',
    tok_SECU: 'invalid_cvc',
    tok_EXPI: 'invalid_expiry',
    tok_FORM: 'invalid_card_data',
  }
  const maxPaymentAttempts = options.maxPaymentAttempts ?? 5
  route('GET', '/checkouts/:id/payment-config', 'checkout:write', ({ params }) => {
    const found = state.checkouts.get(params[0]!) as { checkout: PaymentConfig['checkout'] } | undefined
    if (!found) throw new HttpError(404, 'not_found', 'Checkout not found')
    const st = state.payments.get(params[0]!)
    const config: PaymentConfig = {
      provider: 'mock',
      flow: 'embedded',
      option: 'card',
      payable: found.checkout.status === 'pending' && (st?.attempts ?? 0) < maxPaymentAttempts,
      reason: null,
      amount: found.checkout.total,
      currency: found.checkout.total.currency_code,
      public_key: 'TEST-mock-public-key',
      methods: ['card', 'cash'],
      options: [{ key: 'card', redirect: false, max_installments: 12 }, { key: 'cash', redirect: false }],
      client: { kind: 'mock', sdk_url: 'https://mock.local/sdk.js', public_key: 'TEST-mock-public-key' },
      checkout: found.checkout,
      action: st?.last?.payment.action ?? null,
      attempts_left: maxPaymentAttempts - (st?.attempts ?? 0),
    }
    return { body: config, cache: 'private' }
  })
  route('POST', '/checkouts/:id/payment', 'checkout:write', ({ params, body, headers }) => {
    const key = headers.get('idempotency-key')
    if (!key) throw new HttpError(400, 'validation', 'Idempotency-Key header is required', 'Idempotency-Key')
    const id = params[0]!
    const prev = state.idempotency.get(`pay:${id}:${key}`)
    if (prev) return { status: prev.status, body: prev.body, cache: 'private' }
    const found = state.checkouts.get(id) as { checkout: { status: string; external_order_id: string; total: { amount: string; currency_code: string }; stock_hold_expires_at: string | null } } | undefined
    if (!found) throw new HttpError(404, 'not_found', 'Checkout not found')
    const method = body.method
    if (method !== 'card' && method !== 'cash' && method !== 'bank_transfer') throw new HttpError(400, 'validation', 'method must be card, cash or bank_transfer', 'method')
    const data = body.provider_data
    if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new HttpError(400, 'validation', 'provider_data is required', 'provider_data')
    const exp = body.expected_total as { amount?: string } | undefined
    if (exp && exp.amount !== undefined && toCents(exp.amount) !== toCents(found.checkout.total.amount)) {
      throw new HttpError(422, 'price_mismatch', 'The total changed', 'expected_total', { cost: found.checkout.total })
    }
    const st = state.payments.get(id) ?? { attempts: 0, last: null }
    if (found.checkout.status === 'paid' || st.last?.payment.status === 'pending' || st.last?.payment.status === 'requires_action') {
      throw new HttpError(409, 'conflict', 'A payment is already in progress', 'payment_in_progress')
    }
    if (found.checkout.stock_hold_expires_at && Date.parse(found.checkout.stock_hold_expires_at) < Date.now()) {
      throw new HttpError(409, 'expired', 'The reservation expired')
    }
    if (st.attempts >= maxPaymentAttempts) throw new HttpError(429, 'rate_limited', 'too_many_attempts')
    st.attempts += 1
    const token = typeof (data as Record<string, unknown>).token === 'string' ? ((data as Record<string, unknown>).token as string) : ''
    const attemptsLeft = maxPaymentAttempts - st.attempts
    let payment: PaymentAttemptResult['payment']
    if (method !== 'card') {
      const pointId = String((data as Record<string, unknown>).payment_method_id ?? 'oxxo')
      payment = {
        provider: 'mock',
        status: 'requires_action',
        action: {
          type: 'voucher',
          voucher: {
            payment_point: pointId,
            reference: `${pointId.toUpperCase()}-${id.slice(-6).toUpperCase()}`,
            voucher_url: `https://mock.local/voucher/${id}`,
            amount: found.checkout.total.amount,
            currency: found.checkout.total.currency_code,
            expires_at: new Date(Date.now() + 48 * 3_600_000).toISOString(),
          },
        },
      }
    } else if (token in DECLINES) {
      payment = { provider: 'mock', status: 'failed', decline_code: DECLINES[token]!, retryable: true }
    } else if (token === 'tok_CONT') {
      payment = { provider: 'mock', status: 'pending', action: { type: 'none' } }
    } else if (token === 'tok_3DS') {
      payment = { provider: 'mock', status: 'requires_action', action: { type: 'challenge', challenge: { url: 'https://mock.local/3ds', creq: 'creq' } } }
    } else {
      payment = { provider: 'mock', status: 'paid' }
      found.checkout.status = 'paid'
      const order = state.orders.find((o) => o.id === found.checkout.external_order_id)
      if (order) order.status = 'paid'
    }
    payment.outcome =
      payment.status === 'paid' ? 'approved' : payment.status === 'failed' ? 'rejected' : payment.action?.type === 'challenge' ? 'challenge' : 'pending'
    const result: PaymentAttemptResult = { attempt: { n: st.attempts }, payment, checkout: found.checkout as PaymentAttemptResult['checkout'], attempts_left: attemptsLeft }
    st.last = result
    state.payments.set(id, st)
    state.idempotency.set(`pay:${id}:${key}`, { status: 200, body: result })
    return { body: result, cache: 'private' }
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
        email_verified: kind === 'email',
      }
      state.customers.push(customer)
    }
    const token = `ct_${customer.id}_${Math.random().toString(36).slice(2)}`
    state.sessions.set(token, customer.id)
    trackSession(token, kind)
    return {
      status: 201,
      body: { token, expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), customer },
      cache: 'private',
    }
  })
  route('GET', '/customer/capabilities', 'customer:read', () => ({ body: capabilities, cache: 'private' }))
  route('POST', '/customer/register', 'customer:write', ({ body }) => {
    requirePasswordEnabled()
    const email = emailOf(body)
    const password = passwordOf(body)
    const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
    const first_name = text(body.first_name)
    const last_name = text(body.last_name)
    if (capabilities.email_verification) {
      // Like OPS: with verification the answer is the same whether or not the email already has an account (no
      // enumeration). Proving the mailbox then sets this password on the existing account.
      state.pendingRegistrations.set(email, { password, first_name, last_name })
      state.otps.set(`email:${email}`, otpCode)
      return { status: 202, body: { status: 'verification_required' }, cache: 'private' }
    }
    // Without verification the only way to avoid handing out someone else's session is a 409 (the one residual oracle).
    if (state.passwords.has(email)) throw new HttpError(409, 'conflict', 'An account with this email already exists', 'email')
    state.passwords.set(email, password)
    return { status: 201, body: sessionFor(email, { first_name, last_name }), cache: 'private' }
  })
  route('POST', '/customer/register/verify', 'customer:write', ({ body }) => {
    requirePasswordEnabled()
    const email = emailOf(body)
    const pending = state.pendingRegistrations.get(email)
    if (!pending || typeof body.code !== 'string' || state.otps.get(`email:${email}`) !== body.code) {
      throw new HttpError(401, 'unauthorized', 'Invalid or expired code', 'code')
    }
    state.pendingRegistrations.delete(email)
    state.otps.delete(`email:${email}`)
    state.passwords.set(email, pending.password)
    return { status: 201, body: sessionFor(email, pending), cache: 'private' }
  })
  route('POST', '/customer/login', 'customer:write', ({ body }) => {
    requirePasswordEnabled()
    const email = emailOf(body)
    if ((state.loginFailures.get(email) ?? 0) >= maxLoginAttempts) {
      throw new HttpError(429, 'rate_limited', 'Too many failed attempts, try again later')
    }
    const stored = state.passwords.get(email)
    if (stored === undefined || typeof body.password !== 'string' || body.password !== stored) {
      state.loginFailures.set(email, (state.loginFailures.get(email) ?? 0) + 1)
      throw new HttpError(401, 'unauthorized', 'Invalid email or password')
    }
    state.loginFailures.delete(email)
    return { status: 201, body: sessionFor(email), cache: 'private' }
  })
  route('PUT', '/customer/password', 'customer:write', ({ headers, body }) => {
    requirePasswordEnabled()
    const customer = requireCustomer(headers)
    const password = passwordOf(body)
    const email = customer.email
    if (!email) throw new HttpError(422, 'invalid_state', 'The account has no email', 'email')
    const current = state.passwords.get(email)
    if (current !== undefined && body.current_password !== current) {
      throw new HttpError(401, 'unauthorized', 'current_password is missing or wrong', 'current_password')
    }
    state.passwords.set(email, password)
    return { status: 204 }
  })
  route('POST', '/customer/password/reset', 'customer:write', ({ body }) => {
    requirePasswordEnabled()
    const email = emailOf(body)
    const password = passwordOf(body)
    if (typeof body.code !== 'string' || state.otps.get(`email:${email}`) !== body.code || !state.customers.some((c) => c.email === email)) {
      throw new HttpError(401, 'unauthorized', 'Invalid or expired code', 'code')
    }
    state.otps.delete(`email:${email}`)
    state.passwords.set(email, password)
    state.loginFailures.delete(email)
    return { status: 204 }
  })
  /** The customer as the API serves it: the fiscal evidence keeps no file hash. */
  const publicCustomer = (c0: Customer): Customer => {
    const c: Customer = { ...c0, locale: c0.locale ?? null, preferences: c0.preferences ?? { notifications: {} } }
    if (!c.fiscal?.document) return c
    const { sha256: _sha, ...document } = c.fiscal.document
    return { ...c, fiscal: { ...c.fiscal, document } }
  }
  route('GET', '/customer', 'customer:read', ({ headers }) => ({ body: publicCustomer(requireCustomer(headers)), cache: 'private' }))
  route('PATCH', '/customer', 'customer:write', ({ headers, body }) => {
    const c = requireCustomer(headers)
    const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
    if ('first_name' in body) c.first_name = text(body.first_name)
    if ('last_name' in body) c.last_name = text(body.last_name)
    if ('phone' in body) c.phone = text(body.phone)
    if ('locale' in body) c.locale = parseLocale(body.locale)
    if ('preferences' in body) c.preferences = parsePreferences(c.preferences, body.preferences)
    if ('fiscal' in body) {
      if (body.fiscal === null) c.fiscal = null
      else {
        const fiscal = parseInvoice({ ...(body.fiscal as object), requested: true }, 'fiscal') as InvoiceRequest
        const fid: FiscalIdentity = {
          country_code: String(fiscal.country_code ?? region?.country_code ?? ''),
          tax_id: String(fiscal.tax_id ?? fiscal.rfc).toUpperCase(),
          legal_name: String(fiscal.legal_name ?? fiscal.razon_social),
          tax_regime: String(fiscal.tax_regime ?? fiscal.regimen),
          postal_code: String(fiscal.postal_code ?? fiscal.cp),
          invoice_use: String(fiscal.use ?? fiscal.uso_cfdi ?? fiscal.invoice_use ?? '') || null,
          document: fiscal.document ?? null,
          verification: { status: 'reviewed', checked_at: now() },
        }
        c.fiscal = fid
      }
    }
    return { body: publicCustomer(c), cache: 'private' }
  })
  // Account settings (contract 1.9): language, notification preferences, sessions, re-authentication, export, delete.
  const OPTIONAL_EVENTS = new Set(['order_updates', 'shipping', 'restock'])
  const MANDATORY_EVENTS = new Set(['order_confirmation', 'payment', 'invoice', 'security'])
  const CHANNELS = new Set(['email', 'whatsapp'])
  const REAUTH_WINDOW_MS = 5 * 60_000
  const supportedLocales = () => [state.shop.locale, ...state.shop.locales].filter((l, i, a) => l && a.indexOf(l) === i)

  function parseLocale(raw: unknown): string | null {
    if (raw === null || (typeof raw === 'string' && !raw.trim())) return null
    if (typeof raw !== 'string') throw new HttpError(400, 'validation', 'locale must be a string', 'locale')
    const tag = raw.trim().replace('_', '-')
    const [lang = '', ...rest] = tag.split('-')
    const canonical = [lang.toLowerCase(), ...rest.map((p) => p.toUpperCase())].join('-')
    const supported = supportedLocales()
    const hit = supported.find((l) => l.toLowerCase() === canonical.toLowerCase()) ?? (rest.length === 0 ? supported.find((l) => l.split('-')[0]!.toLowerCase() === canonical) : undefined)
    if (!hit) throw new HttpError(400, 'validation', 'this store is not available in that language', 'locale')
    return hit
  }

  function parsePreferences(current: Customer['preferences'], raw: unknown): Customer['preferences'] {
    if (raw === null) return { notifications: {} }
    if (typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'validation', 'preferences must be an object', 'preferences')
    const merged: Record<string, Record<string, boolean>> = structuredClone(current?.notifications ?? {})
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (key !== 'notifications') throw new HttpError(400, 'validation', 'unknown preference', `preferences.${key}`)
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'validation', 'notifications must map each event to its channels', 'preferences.notifications')
      for (const [event, channels] of Object.entries(value as Record<string, unknown>)) {
        const field = `preferences.notifications.${event}`
        if (MANDATORY_EVENTS.has(event)) throw new HttpError(400, 'validation', 'this notification is required and cannot be turned off', field)
        if (!OPTIONAL_EVENTS.has(event)) throw new HttpError(400, 'validation', 'unknown notification', field)
        if (!channels || typeof channels !== 'object' || Array.isArray(channels)) throw new HttpError(400, 'validation', 'each event maps its channels to true or false', field)
        for (const [channel, on] of Object.entries(channels as Record<string, unknown>)) {
          if (!CHANNELS.has(channel)) throw new HttpError(400, 'validation', 'unknown channel', `${field}.${channel}`)
          if (typeof on !== 'boolean') throw new HttpError(400, 'validation', 'each channel must be true or false', `${field}.${channel}`)
          ;(merged[event] ??= {})[channel] = on
        }
      }
    }
    return { notifications: merged }
  }

  /** The session of the request (its token); the customer must have one. */
  function sessionOf(headers: Headers) {
    const c = requireCustomer(headers)
    const token = headers.get('x-customer-token')!
    if (!state.sessionInfo.has(token)) trackSession(token, 'email')
    return { c, token, info: state.sessionInfo.get(token)! }
  }
  function requireRecentReauth(info: { reauth_at: number | null }) {
    if (info.reauth_at === null || Date.now() - info.reauth_at > REAUTH_WINDOW_MS) {
      throw new HttpError(403, 'reauth_required', 'confirm your password or a code first (customer.reauth)')
    }
  }

  route('GET', '/customer/sessions', 'customer:read', ({ headers }) => {
    const { c, token } = sessionOf(headers)
    const nodes = [...state.sessions.entries()]
      .filter(([, id]) => id === c.id)
      .map(([t]) => ({ t, info: state.sessionInfo.get(t)! }))
      .sort((a, b) => b.info.last_used_at.localeCompare(a.info.last_used_at))
      .map(({ t, info }) => ({
        id: info.id,
        current: t === token,
        device_label: 'Mock browser · Test',
        login_method: info.login_method,
        last_used_at: info.last_used_at,
        created_at: info.created_at,
      }))
    return { body: { nodes }, cache: 'private' }
  })
  route('DELETE', '/customer/sessions/:id', 'customer:write', ({ headers, params }) => {
    const { c, token } = sessionOf(headers)
    const mine = [...state.sessions.entries()].filter(([, id]) => id === c.id).map(([t]) => t)
    if (params[0] === 'others') {
      for (const t of mine) if (t !== token) state.sessions.delete(t)
      return { status: 204 }
    }
    const entry = [...state.sessionInfo.entries()].find(([, i]) => i.id === params[0])
    // A session of someone else and one that never existed are the same 404; a closed one of mine is fine to close again.
    if (!entry || entry[1].customer_id !== c.id) throw new HttpError(404, 'not_found', 'Session not found', 'id')
    state.sessions.delete(entry[0])
    return { status: 204 }
  })
  route('POST', '/customer/reauth', 'customer:write', ({ headers, body }) => {
    const { c, info } = sessionOf(headers)
    const hasPassword = typeof body.password === 'string' && body.password !== ''
    const hasCode = typeof body.otp_code === 'string' && body.otp_code !== ''
    if (hasPassword === hasCode) throw new HttpError(400, 'validation', 'send either password or otp_code', 'password')
    if ((state.reauthFailures.get(c.id) ?? 0) >= 5) throw new HttpError(429, 'rate_limited', 'Too many attempts, try again later')
    const field = hasPassword ? 'password' : 'otp_code'
    const ok = hasPassword
      ? c.email !== null && state.passwords.get(c.email) === body.password
      : [c.email && `email:${c.email}`, c.phone && `phone:${c.phone}`].some((id) => !!id && state.otps.get(id) === body.otp_code)
    if (!ok) {
      state.reauthFailures.set(c.id, (state.reauthFailures.get(c.id) ?? 0) + 1)
      throw new HttpError(400, 'validation', 'could not verify; check the credential and try again', field)
    }
    state.reauthFailures.delete(c.id)
    info.reauth_at = Date.now()
    return { body: { reauth_at: new Date(info.reauth_at).toISOString(), valid_for_seconds: REAUTH_WINDOW_MS / 1000 }, cache: 'private' }
  })
  // E-mail of the account (contract 1.15). The mock's code is `otpCode`, like the sign-in one.
  const emailCodeKey = (kind: 'verify' | 'change', customerId: string, email: string) => `${kind}_email:${customerId}:${email}`
  route('POST', '/customer/email/verification', 'customer:write', ({ headers }) => {
    const { c } = sessionOf(headers)
    if (!c.email) throw new HttpError(422, 'invalid_state', 'The account has no email', 'email')
    if (c.email_verified !== false) throw new HttpError(422, 'invalid_state', 'The email is already verified', 'email')
    state.otps.set(emailCodeKey('verify', c.id, c.email), otpCode)
    return { status: 204 }
  })
  route('POST', '/customer/email/verification/confirm', 'customer:write', ({ headers, body }) => {
    const { c } = sessionOf(headers)
    if (!c.email) throw new HttpError(422, 'invalid_state', 'The account has no email', 'email')
    if (c.email_verified !== false) throw new HttpError(422, 'invalid_state', 'The email is already verified', 'email')
    const key = emailCodeKey('verify', c.id, c.email)
    if (typeof body.code !== 'string' || state.otps.get(key) !== body.code) throw new HttpError(400, 'validation', 'The code is invalid or expired; request a new one', 'code')
    state.otps.delete(key)
    c.email_verified = true
    return { body: c, cache: 'private' }
  })
  route('POST', '/customer/email/change', 'customer:write', ({ headers, body }) => {
    const { c, info } = sessionOf(headers)
    requireRecentReauth(info)
    const email = emailOf(body)
    if (email === c.email) throw new HttpError(400, 'validation', 'This is already the email of the account', 'email')
    // Same answer whether or not the address has an account; if it has, no code exists for it.
    const taken = state.customers.some((x) => x.email === email) || state.passwords.has(email)
    if (!taken) state.otps.set(emailCodeKey('change', c.id, email), otpCode)
    return { status: 202, body: { status: 'verification_required' }, cache: 'private' }
  })
  route('POST', '/customer/email/change/confirm', 'customer:write', ({ headers, body }) => {
    const { c, token } = sessionOf(headers)
    const email = emailOf(body)
    const key = emailCodeKey('change', c.id, email)
    if (typeof body.code !== 'string' || state.otps.get(key) !== body.code) throw new HttpError(400, 'validation', 'The code is invalid or expired; request a new one', 'code')
    state.otps.delete(key)
    if (c.email && state.passwords.has(c.email)) {
      state.passwords.set(email, state.passwords.get(c.email)!)
      state.passwords.delete(c.email)
    }
    c.email = email
    c.email_verified = true
    for (const [t, id] of [...state.sessions.entries()]) if (id === c.id && t !== token) state.sessions.delete(t)
    return { body: c, cache: 'private' }
  })
  route('POST', '/customer/data-export', 'customer:write', ({ headers }) => {
    const { c, info } = sessionOf(headers)
    requireRecentReauth(info)
    if ((state.exportsServed.get(c.id) ?? 0) >= 3) throw new HttpError(429, 'rate_limited', 'Three exports a day; try again tomorrow')
    state.exportsServed.set(c.id, (state.exportsServed.get(c.id) ?? 0) + 1)
    const doc = {
      format: 'storefront-customer-data/1',
      exported_at: now(),
      account: { id: c.id, email: c.email, phone: c.phone, first_name: c.first_name, last_name: c.last_name, locale: c.locale ?? null, created_at: c.created_at },
      preferences: c.preferences ?? { notifications: {} },
      addresses: state.addresses.get(c.id) ?? [],
      fiscal_profiles: state.fiscalProfiles.get(c.id) ?? [],
      orders: state.orders.filter((o) => o.customer_id === c.id).map((o) => ({ id: o.id, number: o.number, created_at: o.created_at, status: o.status, total: o.total })),
    }
    return {
      body: {
        filename: `account-data-${now().slice(0, 10)}.json`,
        content_type: 'application/json',
        content_base64: btoa(unescape(encodeURIComponent(JSON.stringify(doc, null, 2)))),
      },
      cache: 'private',
    }
  })
  route('DELETE', '/customer', 'customer:write', ({ headers, body }) => {
    const token = headers.get('x-customer-token')
    if (token && state.deletedTokens.has(token)) return { status: 204 }
    const { c, info } = sessionOf(headers)
    requireRecentReauth(info)
    if (typeof body.confirm !== 'string' || !body.confirm.trim() || body.confirm.length > 100) {
      throw new HttpError(400, 'validation', 'confirm is required: the text the buyer typed', 'confirm')
    }
    const closed = new Set(['fulfilled', 'delivered', 'cancelled'])
    if (state.orders.some((o) => o.customer_id === c.id && !closed.has(o.status))) {
      throw new HttpError(409, 'conflict', 'you have an order in progress; you can delete the account once it is delivered', 'orders')
    }
    if (c.id === 'cus_1' && state.pendingPayments.some((p) => p.status === 'pending_payment')) {
      throw new HttpError(409, 'conflict', 'you have a payment waiting to be completed', 'pending_payments')
    }
    // Personal data goes; orders stay (they keep the customer id) and a new sign-up starts from nothing.
    for (const [t, id] of [...state.sessions.entries()]) {
      if (id === c.id) {
        state.sessions.delete(t)
        state.deletedTokens.add(t)
      }
    }
    if (c.email) state.passwords.delete(c.email)
    state.addresses.delete(c.id)
    state.fiscalProfiles.delete(c.id)
    state.customers = state.customers.filter((x) => x.id !== c.id)
    return { status: 204 }
  })

  /**
   * The order as the API serves it. The list is a summary (`shipments_summary`); the detail carries the shipments, invoices,
   * payments, refunds and the address. A sandbox shipment loses its guide, as the real server does in production.
   */
  const orderView = ({ customer_id: _c, ...o }: MockState['orders'][number], detail: boolean): Order => {
    const order: Order = { ...o, invoice: orderInvoice(o as MockState['orders'][number]) }
    if (order.shipments) order.shipments = order.shipments.map((s) => (isTestShipment(s) ? { ...s, tracking_number: null, tracking_url: null } : { ...s, events: sortTrackingEvents(s.events) }))
    order.progress = orderProgress(order)
    order.next_action = nextAction(order)
    const live = orderShipments(order).filter((s) => !isTestShipment(s))
    if (order.shipments?.length) {
      order.shipments_summary = { count: order.shipments.length, status: shipmentsStatus(order) ?? 'pending', carrier: live[0]?.carrier ?? null, ...(live[0]?.tracking_url ? { tracking_url: live[0].tracking_url } : {}) }
    }
    if (!detail) {
      delete order.shipments
      delete order.invoices
      delete order.payments
      delete order.refunds
      delete order.shipping_address
    }
    return order
  }
  /**
   * The account lists (contract 1.19): keyset cursor on (created_at, id), newest first, `first` 1–50 (10 by default),
   * `after` / `before`, filters. The cursor is opaque and stable while orders are added.
   */
  const accountPage = <S, N>(rows: { order: S; key: { t: string; id: string } }[], search: URLSearchParams, node: (o: S) => N | null, total: ((n: number) => number) | null) => {
    const first = search.has('first') ? Number(search.get('first')) : 10
    if (!Number.isInteger(first) || first < 1 || first > 50) throw new HttpError(400, 'validation', '`first` must be an integer between 1 and 50', 'first')
    const after = search.get('after')
    const before = search.get('before')
    if (after && before) throw new HttpError(400, 'validation', 'use after or before, not both', 'before')
    const parse = (raw: string, field: string) => {
      let parts: string[] = []
      try {
        parts = atob(raw.replace(/-/g, '+').replace(/_/g, '/')).split('|')
      } catch {
        /* falls through */
      }
      if (parts.length !== 3 || parts[0] !== 'k1' || !parts[1] || !parts[2]) throw new HttpError(400, 'validation', `${field} is not a valid cursor`, field)
      return { t: parts[1], id: parts[2] }
    }
    const enc = (k: { t: string; id: string }) => btoa(`k1|${k.t}|${k.id}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const newer = (a: { t: string; id: string }, b: { t: string; id: string }) => (a.t === b.t ? a.id > b.id : a.t > b.t)
    const sorted = rows.slice().sort((a, b) => (newer(a.key, b.key) ? -1 : newer(b.key, a.key) ? 1 : 0))
    const kept = sorted.map((r) => ({ r, n: node(r.order) })).filter((x) => x.n !== null)
    let slice: typeof kept
    let more: boolean
    if (before) {
      const c = parse(before, 'before')
      const prior = kept.filter((x) => newer(x.r.key, c))
      slice = prior.slice(Math.max(0, prior.length - first))
      more = prior.length > first
    } else {
      const c = after ? parse(after, 'after') : null
      const rest = c ? kept.filter((x) => newer(c, x.r.key)) : kept
      slice = rest.slice(0, first)
      more = rest.length > first
    }
    const nodes = slice.map((x) => x.n as N)
    const startKey = slice[0]?.r.key
    const endKey = slice[slice.length - 1]?.r.key
    const page_info = before
      ? { has_next_page: true, has_previous_page: more, start_cursor: startKey ? enc(startKey) : null, end_cursor: endKey ? enc(endKey) : null }
      : { has_next_page: more, has_previous_page: !!after, start_cursor: startKey ? enc(startKey) : null, end_cursor: endKey ? enc(endKey) : null }
    return { nodes, page_info, ...(total ? { total_count: total(kept.length) } : {}) }
  }
  const dayBounds = (search: URLSearchParams) => {
    const bound = (k: string, end: boolean) => {
      const v = search.get(k)
      if (!v) return null
      const day = /^\d{4}-\d{2}-\d{2}$/.test(v)
      const t = Date.parse(day ? `${v}T00:00:00.000Z` : v)
      if (Number.isNaN(t)) throw new HttpError(400, 'validation', `${k} must be a date (YYYY-MM-DD) or an RFC 3339 time`, k)
      return day && end ? t + 86400_000 : t
    }
    return { from: bound('from', false), to: bound('to', true) }
  }
  type MockOrder = MockState['orders'][number]
  const ownRows = (headers: Headers, search: URLSearchParams) => {
    const c = requireCustomer(headers)
    const { from, to } = dayBounds(search)
    const q = (search.get('q') ?? '').trim().replace(/^#/, '').toLowerCase()
    return state.orders
      .filter((o) => o.customer_id === c.id)
      .filter((o) => (from === null || Date.parse(o.created_at) >= from) && (to === null || Date.parse(o.created_at) < to))
      .filter((o) => !q || o.number.toLowerCase() === q)
      .map((o) => ({ order: o as MockOrder, key: { t: o.created_at, id: o.id } }))
  }
  const hasInvoice = (o: MockOrder) => (o.invoices ?? []).length > 0 || ['issuing', 'queued', 'requested', 'issued', 'needs_data', 'needs_review'].includes(orderInvoice(o).stage ?? '')
  route('GET', '/customer/orders', 'orders:read', ({ headers, search }) => {
    const status = search.get('status')
    const delivery = search.get('delivery_method')
    const wantInvoice = search.get('has_invoice')
    if (delivery && delivery !== 'shipping' && delivery !== 'pickup') throw new HttpError(400, 'validation', 'delivery_method must be pickup or shipping', 'delivery_method')
    if (wantInvoice && wantInvoice !== 'true' && wantInvoice !== 'false') throw new HttpError(400, 'validation', 'has_invoice must be true or false', 'has_invoice')
    const rows = ownRows(headers, search)
    const filtered = !!(status || delivery || wantInvoice || search.get('q'))
    const body = accountPage(
      rows,
      search,
      (o) => {
        const view = orderView(o, false)
        if (status && view.status !== status && view.progress?.stage !== status) return null
        if (delivery && o.delivery_method !== delivery) return null
        if (wantInvoice && hasInvoice(o) !== (wantInvoice === 'true')) return null
        return view
      },
      filtered ? null : (n) => n,
    )
    return { body, cache: 'private' }
  })
  route('GET', '/customer/invoices', 'orders:read', ({ headers, search }) => {
    const status = search.get('status')
    return {
      body: accountPage(
        ownRows(headers, search),
        search,
        (o) => {
          const invoices = (o.invoices ?? []).filter((d) => !status || d.status === status)
          return invoices.length ? { order: { id: o.id, number: o.number, created_at: o.created_at }, invoices } : null
        },
        null,
      ),
      cache: 'private',
    }
  })
  route('GET', '/customer/shipments', 'orders:read', ({ headers, search }) => {
    const status = search.get('status')
    return {
      body: accountPage(
        ownRows(headers, search),
        search,
        (o) => {
          if (o.delivery_method === 'pickup' || ['cancelled', 'refunded', 'pending_payment'].includes(o.status)) return null
          const view = orderView(o, true)
          const shipments = (view.shipments ?? []).map((s) => ({ ...s, events: [], map: null }))
          const service = view.shipping_service ?? null
          if (!service && shipments.length === 0) return null
          if (status && !shipments.some((s) => s.status === status)) return null
          return { order: { id: o.id, number: o.number, created_at: o.created_at }, stage: view.progress?.stage ?? o.status, service, shipments }
        },
        null,
      ),
      cache: 'private',
    }
  })
  const findOrder = (headers: Headers, id: string) => {
    const c = requireCustomer(headers)
    return requireNode(state.orders.find((o) => o.id === id && o.customer_id === c.id), `Order ${id}`, 'id')
  }
  route('GET', '/customer/orders/:id', 'orders:read', ({ headers, params }) => ({ body: orderView(findOrder(headers, params[0]!), true), cache: 'private' }))
  route('POST', '/customer/orders/:id/returns', 'customer:write', ({ headers, params, body }) => {
    const order = findOrder(headers, params[0]!)
    if (!Array.isArray(body.lines) || body.lines.length === 0) throw new HttpError(400, 'validation', 'lines are required', 'lines')
    return { status: 201, body: { id: nextId('ret'), order_id: order.id, status: 'requested' }, cache: 'private' }
  })
  route('POST', '/customer/orders/:id/invoice', 'customer:write', ({ headers, params, body }) => {
    const order = findOrder(headers, params[0]!)
    const existing = state.invoices.get(order.id)
    if (existing && existing.stage !== 'awaiting_payment') {
      return { status: existing.stage === 'issued' ? 200 : 202, body: { status: existing.stage === 'issued' ? 'issued' : 'requested', url: null, stage: existing.stage, invoice: orderInvoice(order) }, cache: 'private' }
    }
    const request = parseInvoice({ ...body, requested: true }, 'invoice') as InvoiceRequest
    if (order.status === 'pending_payment') throw new HttpError(409, 'awaiting_payment', 'The order is not paid yet')
    state.invoices.set(order.id, { stage: 'queued', request })
    return { status: 202, body: { status: 'requested', url: null, stage: 'queued', invoice: orderInvoice(order) }, cache: 'private' }
  })
  route('GET', '/customer/pending-payments', 'orders:read', ({ headers, search }) => {
    const c = requireCustomer(headers)
    const nodes = c.id === 'cus_1' ? state.pendingPayments : []
    return { body: paginate(nodes, search, 20), cache: 'private' }
  })
  route('GET', '/customer/orders/:id/invoices/:invoice_id/:kind', 'orders:read', ({ headers, params }) => {
    const order = findOrder(headers, params[0]!)
    const doc = order.invoices?.find((d: InvoiceDoc) => d.id === params[1])
    if (!doc || (params[2] !== 'pdf' && params[2] !== 'xml')) throw new HttpError(404, 'not_found', 'Invoice file not found', 'invoice_id')
    const pdf = params[2] === 'pdf'
    const text = pdf ? `%PDF-1.4\n% mock invoice ${doc.id}\n%%EOF\n` : `<?xml version="1.0"?><cfdi:Comprobante mock="true" id="${doc.id}"/>`
    const file: InvoiceFile = {
      filename: `${doc.kind === 'credit_note' ? 'nota-de-credito' : 'factura'}-${doc.id}.${params[2]}`,
      content_type: pdf ? 'application/pdf' : 'application/xml',
      content_base64: btoa(text),
    }
    return { body: file, headers: { 'Cache-Control': 'no-store' } }
  })
  // Saved fiscal profiles (contract 1.9): up to MAX_FISCAL_PROFILES per buyer, one default, physical delete.
  const MAX_FISCAL_PROFILES = 10
  const profilesOf = (c: Customer) => state.fiscalProfiles.get(c.id) ?? []
  /** What the API serves: the evidence keeps no file hash. */
  const publicProfile = (p: FiscalProfile): FiscalProfile => {
    if (!p.document) return p
    const { sha256: _sha, ...document } = p.document
    return { ...p, document }
  }
  const personTypeOf = (taxId: string): string | null => {
    for (const [type, pattern] of Object.entries(region?.fiscal_id?.person_patterns ?? {})) if (new RegExp(pattern).test(taxId)) return type
    return null
  }
  /** `Customer.fiscal` mirrors the default profile, as the real server does. */
  const mirrorDefaultProfile = (c: Customer) => {
    const d = profilesOf(c).find((p) => p.is_default)
    c.fiscal = d
      ? { country_code: d.country_code, tax_id: d.tax_id, legal_name: d.legal_name, tax_regime: d.tax_regime, postal_code: d.postal_code, invoice_use: d.invoice_use ?? null, document: d.document ?? null, verification: d.verification ?? null }
      : null
  }
  const profileFields = (body: Record<string, unknown>, base?: FiscalProfile): FiscalIdentity => {
    const merged: Record<string, unknown> = {
      ...(base ? { tax_id: base.tax_id, legal_name: base.legal_name, tax_regime: base.tax_regime, postal_code: base.postal_code, country_code: base.country_code, ...(base.invoice_use ? { use: base.invoice_use } : {}) } : {}),
      ...body,
      requested: true,
    }
    delete merged.label
    delete merged.is_default
    delete merged.verification
    const fiscal = parseInvoice(merged, 'fiscal') as InvoiceRequest
    return {
      country_code: String(fiscal.country_code ?? region?.country_code ?? ''),
      tax_id: String(fiscal.tax_id ?? fiscal.rfc).toUpperCase(),
      legal_name: String(fiscal.legal_name ?? fiscal.razon_social),
      tax_regime: String(fiscal.tax_regime ?? fiscal.regimen),
      postal_code: String(fiscal.postal_code ?? fiscal.cp),
      invoice_use: String(fiscal.use ?? fiscal.uso_cfdi ?? fiscal.invoice_use ?? '') || null,
      document: fiscal.document ?? base?.document ?? null,
    }
  }
  const ownProfile = (c: Customer, id: string | undefined) => {
    const p = profilesOf(c).find((x) => x.id === id)
    if (!p) throw new HttpError(404, 'not_found', 'Fiscal profile not found', 'id')
    return p
  }
  const makeDefault = (c: Customer, id: string) => state.fiscalProfiles.set(c.id, profilesOf(c).map((p) => ({ ...p, is_default: p.id === id })))
  route('GET', '/customer/fiscal-profiles', 'customer:read', ({ headers }) => {
    const c = requireCustomer(headers)
    const nodes = [...profilesOf(c)].sort((a, b) => Number(b.is_default) - Number(a.is_default) || (b.last_used_at ?? '').localeCompare(a.last_used_at ?? ''))
    return { body: { nodes: nodes.map(publicProfile) }, cache: 'private' }
  })
  route('POST', '/customer/fiscal-profiles', 'customer:write', ({ headers, body }) => {
    const c = requireCustomer(headers)
    const list = profilesOf(c)
    const fid = profileFields(body)
    if (list.length >= MAX_FISCAL_PROFILES) throw new HttpError(409, 'conflict', 'Fiscal profile limit reached; delete one first')
    if (list.some((p) => p.country_code === fid.country_code && p.tax_id === fid.tax_id)) throw new HttpError(409, 'conflict', 'A profile with this tax id already exists', 'tax_id')
    const at = now()
    const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 40) : fid.legal_name.slice(0, 40)
    const profile: FiscalProfile = { ...fid, id: nextId('fisc'), label, person_type: personTypeOf(fid.tax_id), is_default: false, last_used_at: null, created_at: at, updated_at: at, verification: { status: 'unverified', checked_at: null } }
    state.fiscalProfiles.set(c.id, [...list, profile])
    if (list.length === 0 || body.is_default === true) makeDefault(c, profile.id)
    mirrorDefaultProfile(c)
    return { status: 201, body: publicProfile(profilesOf(c).find((p) => p.id === profile.id)!), cache: 'private' }
  })
  route('PATCH', '/customer/fiscal-profiles/:id', 'customer:write', ({ headers, params, body }) => {
    const c = requireCustomer(headers)
    const cur = ownProfile(c, params[0])
    if ('verification' in body) throw new HttpError(400, 'validation', 'verification is set by the server', 'verification')
    if (body.is_default === false && cur.is_default) throw new HttpError(400, 'validation', 'Make another profile the default instead', 'is_default')
    const fid = profileFields(body as FiscalProfileInput as Record<string, unknown>, cur)
    if (profilesOf(c).some((p) => p.id !== cur.id && p.country_code === fid.country_code && p.tax_id === fid.tax_id)) throw new HttpError(409, 'conflict', 'A profile with this tax id already exists', 'tax_id')
    const identityChanged = fid.tax_id !== cur.tax_id || fid.country_code !== cur.country_code
    const updated: FiscalProfile = {
      ...cur,
      ...fid,
      document: 'document' in body ? fid.document : identityChanged ? null : cur.document,
      label: typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 40) : cur.label,
      person_type: personTypeOf(fid.tax_id),
      verification: identityChanged ? { status: 'unverified', checked_at: null } : cur.verification,
      updated_at: now(),
    }
    state.fiscalProfiles.set(c.id, profilesOf(c).map((p) => (p.id === cur.id ? updated : p)))
    if (body.is_default === true) makeDefault(c, cur.id)
    mirrorDefaultProfile(c)
    return { body: publicProfile(profilesOf(c).find((p) => p.id === cur.id)!), cache: 'private' }
  })
  route('DELETE', '/customer/fiscal-profiles/:id', 'customer:write', ({ headers, params }) => {
    const c = requireCustomer(headers)
    const cur = ownProfile(c, params[0])
    const rest = profilesOf(c).filter((p) => p.id !== cur.id)
    state.fiscalProfiles.set(c.id, rest)
    if (cur.is_default && rest[0]) makeDefault(c, rest[0].id)
    mirrorDefaultProfile(c)
    return { status: 204 }
  })
  // Buyer items, «My items» (contract 1.9): kinds are data the store declares; the server validates against them,
  // builds `label` / `fit_key` and keeps private fields apart (returned only masked). Physical delete.
  const MAX_SUBJECTS = 50
  const subjectsOf = (c: Customer) => state.subjects.get(c.id) ?? []
  const kinds = () => options.subjectKinds ?? []
  const publicSubject = (s: Subject & { private: Record<string, string> }): Subject => {
    const { private: priv, ...rest } = s
    return { ...rest, attributes: { ...s.attributes, ...Object.fromEntries(Object.keys(priv).map((k) => [k, PRIVATE_MASK + (priv[k]!.length > 3 ? priv[k]!.slice(-2) : '')])) } }
  }
  const ownSubject = (c: Customer, id: string | undefined) => {
    const s = subjectsOf(c).find((x) => x.id === id)
    if (!s) throw new HttpError(404, 'not_found', 'Item not found', 'id')
    return s
  }
  const setDefaultSubject = (c: Customer, id: string) => {
    const kind = ownSubject(c, id).kind
    state.subjects.set(c.id, subjectsOf(c).map((s) => (s.kind !== kind ? s : s.id === id ? { ...s, is_default: true, last_used_at: now() } : { ...s, is_default: false })))
  }
  const resolveOrThrow = (kind: SubjectKind, values: SubjectValues) => {
    const r = resolveSubject(kind, values)
    if (!r.ok) {
      const [field, code] = Object.entries(r.problems)[0]!
      throw new HttpError(422, 'validation', `${field}: ${code}`, field === '_' ? 'attributes' : `attributes.${field}`)
    }
    return r.subject
  }
  const cleanNickname = (v: unknown): string | null => {
    if (v === undefined || v === null || v === '') return null
    if (typeof v !== 'string' || [...v.trim()].length > 40) throw new HttpError(422, 'validation', 'nickname is too long (max 40)', 'nickname')
    return v.trim().split(/\s+/).join(' ')
  }
  route('GET', '/subject-kinds', 'content:read', () => ({ body: { nodes: kinds() }, cache: 'public' }))
  route('GET', '/customer/subjects', 'customer:read', ({ headers, search }) => {
    const c = requireCustomer(headers)
    const kind = search.get('kind')
    const nodes = subjectsOf(c)
      .filter((s) => !kind || s.kind === kind)
      .sort((a, b) => a.kind.localeCompare(b.kind) || Number(b.is_default) - Number(a.is_default) || (b.last_used_at ?? '').localeCompare(a.last_used_at ?? ''))
    return { body: { nodes: nodes.map(publicSubject) }, cache: 'private' }
  })
  route('POST', '/customer/subjects', 'customer:write', ({ headers, body }) => {
    const c = requireCustomer(headers)
    const kind = kinds().find((k) => k.key === body.kind)
    if (!kind) throw new HttpError(422, 'validation', 'This store has no such kind', 'kind')
    const attrs = body.attributes
    if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) throw new HttpError(422, 'validation', 'attributes must be an object', 'attributes')
    const r = resolveOrThrow(kind, attrs as SubjectValues)
    const list = subjectsOf(c)
    if (list.length >= MAX_SUBJECTS || list.filter((s) => s.kind === kind.key).length >= kind.max_per_account) throw new HttpError(409, 'conflict', 'Limit reached; delete one first', 'kind')
    if (r.fit_key && list.some((s) => s.kind === kind.key && s.fit_key === r.fit_key)) throw new HttpError(409, 'conflict', 'You already saved this item', 'attributes')
    const subject = { id: nextId('subj'), kind: kind.key, label: r.label, nickname: cleanNickname(body.nickname), fit_key: r.fit_key, attributes: r.attributes, private: r.private, is_default: false, last_used_at: null, created_at: now() }
    state.subjects.set(c.id, [...list, subject])
    if (!list.some((s) => s.kind === kind.key) || body.is_default === true) setDefaultSubject(c, subject.id)
    return { status: 201, body: publicSubject(ownSubject(c, subject.id)), cache: 'private' }
  })
  route('PATCH', '/customer/subjects/:id', 'customer:write', ({ headers, params, body }) => {
    const c = requireCustomer(headers)
    const cur = ownSubject(c, params[0])
    if (body.is_default === false && cur.is_default) throw new HttpError(422, 'validation', 'Make another item the default instead', 'is_default')
    let next = { ...cur }
    if ('nickname' in body) next.nickname = cleanNickname(body.nickname)
    if ('attributes' in body) {
      const kind = kinds().find((k) => k.key === cur.kind)
      if (!kind) throw new HttpError(422, 'validation', 'This store no longer offers this kind', 'kind')
      const sent = (body.attributes ?? {}) as Record<string, unknown>
      const merged: Record<string, unknown> = { ...cur.attributes, ...cur.private }
      for (const [k, v] of Object.entries(sent)) {
        if (k in cur.private && isMasked(v)) continue // the mask the client was shown: keep the stored value
        if (v === null) delete merged[k]
        else merged[k] = v
      }
      const r = resolveOrThrow(kind, merged as SubjectValues)
      if (r.fit_key && subjectsOf(c).some((s) => s.id !== cur.id && s.kind === cur.kind && s.fit_key === r.fit_key)) throw new HttpError(409, 'conflict', 'You already saved this item', 'attributes')
      next = { ...next, label: r.label, fit_key: r.fit_key, attributes: r.attributes, private: r.private }
    }
    state.subjects.set(c.id, subjectsOf(c).map((s) => (s.id === cur.id ? next : s)))
    if (body.is_default === true && !cur.is_default) setDefaultSubject(c, cur.id)
    return { body: publicSubject(ownSubject(c, cur.id)), cache: 'private' }
  })
  route('DELETE', '/customer/subjects/:id', 'customer:write', ({ headers, params }) => {
    const c = requireCustomer(headers)
    const cur = ownSubject(c, params[0])
    state.subjects.set(c.id, subjectsOf(c).filter((s) => s.id !== cur.id))
    const heir = subjectsOf(c).filter((s) => s.kind === cur.kind).sort((a, b) => (b.last_used_at ?? '').localeCompare(a.last_used_at ?? ''))[0]
    if (cur.is_default && heir) setDefaultSubject(c, heir.id)
    return { status: 204 }
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
    let all: string[]
    if (token.startsWith('pk_')) all = ['catalog:read', 'content:read', 'cart:write']
    else if (token.startsWith('sk_')) all = ['catalog:read', 'content:read', 'cart:write', 'checkout:write', 'customer:read', 'customer:write', 'orders:read']
    else return null
    return new Set(all.filter((sc) => !missingScopes.includes(sc)))
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
      { error: { code: err.code, message: err.message, ...(err.field ? { field: err.field } : {}), ...(err.details !== undefined ? { details: err.details } : {}), ...(err.requiredScopes ? { required_scopes: err.requiredScopes } : {}) } },
      { 'Cache-Control': PRIVATE_CACHE },
    )
  }

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (/\/_token\/?$/.test(url.pathname)) {
      const tok = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null
      const granted = scopesFor(tok)
      if (!tok || !granted) return errorResponse(new HttpError(401, 'unauthorized', 'Missing or invalid storefront token'))
      return json(200, { success: true, data: { kind: tok.startsWith('pk_') ? 'publishable' : 'secret', environment: 'sandbox', scopes: [...granted], missing_scopes: missingScopes, connection_id: 'conn_mock', expires_at: null } }, { 'Cache-Control': PRIVATE_CACHE })
    }
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
    if ((enforceScopes || missingScopes.length > 0) && !scopes.has(r.scope)) {
      return errorResponse(new HttpError(403, 'insufficient_scope', `Token lacks scope ${r.scope}`, undefined, undefined, [r.scope]))
    }

    let body: Record<string, unknown> = {}
    if (method !== 'GET') {
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
