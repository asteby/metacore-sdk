/**
 * Storefront API v1 contract types.
 *
 * Field names match the wire format exactly (snake_case). Money amounts are
 * decimal strings ("1899.00") so no precision is lost in transit.
 */

import type { OpeningHours } from './geo.js'

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type Money = { amount: string; currency_code: string }

export type Image = { url: string; alt: string | null; width?: number; height?: number }

export type SEO = { title: string | null; description: string | null }

export type PageInfo = { has_next_page: boolean; end_cursor: string | null }

export type Connection<T> = { nodes: T[]; page_info: PageInfo; total_count?: number }

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export type ProductOption = { name: string; values: string[] }

export type SelectedOption = { name: string; value: string }

export type ProductVariant = {
  id: string
  sku: string
  title: string
  selected_options: SelectedOption[]
  price: Money
  compare_at_price: Money | null
  available_for_sale: boolean
  quantity_available: number | null
  image: Image | null
  barcode: string | null
}

export type ProductAttributeValue = string | number | boolean

export type ProductCategory = { id: string; handle: string; title: string }

export type MoneyRange = { min: Money; max: Money }

export type Product = {
  id: string
  handle: string
  title: string
  description: string
  /** HTML sanitized server-side. */
  description_html: string
  /** Brand. */
  vendor: string | null
  product_type: string | null
  category: ProductCategory | null
  tags: string[]
  /** Free-form typed attributes, e.g. tire specs: width, aspect, rim, size_key. */
  attributes: Record<string, ProductAttributeValue>
  featured_image: Image | null
  images: Image[]
  options: ProductOption[]
  variants: ProductVariant[]
  price_range: MoneyRange
  compare_at_price_range: MoneyRange | null
  available_for_sale: boolean
  seo: SEO
  /** RFC 3339. */
  updated_at: string
}

export type Collection = {
  id: string
  handle: string
  title: string
  description: string
  image: Image | null
  seo: SEO
  parent_handle: string | null
}

export type FacetValue = { value: string; label: string; count: number }

export type Facet = {
  key: string
  label: string
  type: 'list' | 'price_range'
  values: FacetValue[]
}

export type ProductSort = 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'title_asc'

export type ProductConnection = Connection<Product> & { facets: Facet[] }

/** `quantity_available` is `null` when the variant's stock is not tracked (always sellable). */
export type StockLevel = { sku: string; quantity_available: number | null }

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

export type ShopContact = { email: string | null; phone: string | null; whatsapp: string | null }

export type ShopBranch = {
  id: string
  name: string
  address: string
  city: string
  phone: string | null
  lat: number | null
  lng: number | null
  hours: string | null
  /**
   * Structured hours. Optional: only present once the Storefront API ships
   * `locations.v1`; today's API returns `hours` (free text) only.
   */
  opening_hours?: OpeningHours
  /** IANA time zone of the branch (e.g. `America/Mexico_City`). Comes with `locations.v1`. */
  timezone?: string
  /** Human-readable hours, authoritative for display. Comes with `locations.v1`. */
  opening_hours_text?: string
}

export type ShopPolicies = { free_shipping_min: Money | null; returns_days: number | null }

export type Shop = {
  name: string
  description: string | null
  domain: string | null
  currency_code: string
  locale: string
  locales: string[]
  country_code: string
  logo: Image | null
  contact: ShopContact
  branches: ShopBranch[]
  policies: ShopPolicies
}

// ---------------------------------------------------------------------------
// Cart and checkout
// ---------------------------------------------------------------------------

/**
 * Postal address. The contract references `Address` without spelling it out;
 * this is the shape the client sends and the mock returns.
 */
export type Address = {
  /** Present on saved customer addresses. */
  id?: string
  first_name: string | null
  last_name: string | null
  company: string | null
  address1: string
  address2: string | null
  city: string
  province: string | null
  zip: string
  country_code: string
  phone: string | null
  /** Colonia. Sent and echoed by the cart API. */
  neighborhood?: string | null
  province_code?: string | null
  /** Delivery reference ("between streets", gate code...). */
  reference?: string | null
}

export type AddressInput = Partial<Omit<Address, 'id' | 'address1' | 'city' | 'zip' | 'country_code'>> &
  Pick<Address, 'address1' | 'city' | 'zip' | 'country_code'>

export type CartLineMerchandise = ProductVariant & {
  product: Pick<Product, 'handle' | 'title' | 'featured_image'>
}

export type CartLine = {
  id: string
  quantity: number
  merchandise: CartLineMerchandise
  cost: { total: Money; unit: Money; compare_at_unit: Money | null; discount?: Money }
}

export type CartDiscountCode = {
  code: string
  applicable: boolean
  /** Why an inapplicable code was not applied. */
  reason?: string
}

export type CartBuyer = { email: string | null; phone: string | null; customer_id: string | null }

export type DeliveryMethod = 'shipping' | 'pickup'

export type CartDelivery = {
  method: DeliveryMethod | null
  rate_id: string | null
  branch_id: string | null
  /** Present when the chosen option is no longer valid (e.g. the quote expired). */
  problem?: string
  /** Description of the chosen carrier rate (carrier addons only). */
  title?: string | null
  carrier?: string | null
  eta?: string | null
}

export type CartCost = {
  subtotal: Money
  discount: Money
  shipping: Money | null
  tax: Money | null
  total: Money
  tax_included: boolean
}

export type Cart = {
  id: string
  /** `active` while it can be edited; anything else is a cart already turned into an order. */
  status?: string
  currency_code?: string
  lines: CartLine[]
  total_quantity: number
  discount_codes: CartDiscountCode[]
  buyer: CartBuyer
  shipping_address: Address | null
  delivery: CartDelivery
  cost: CartCost
  note?: string | null
  updated_at: string
}

export type CartLineInput = { variant_id: string; quantity: number }

export type CartLineUpdateInput = { id: string; quantity: number }

export type CartBuyerInput = { email?: string | null; phone?: string | null }

/**
 * A delivery rate. `id`, `title`, `cost` and `eta` are always present. The rest only
 * comes from carrier addons (`commerce.shipping.rates`); `cost` already reflects a
 * free-shipping code. Show it as is; never recompute.
 */
export type ShippingRate = {
  id: string
  title: string
  cost: Money
  eta: string | null
  /** Addon key of the rate provider. */
  provider?: string
  carrier?: string | null
  service_code?: string | null
  eta_days_min?: number
  eta_days_max?: number
  /** e.g. `home`, `pickup_point`. */
  delivery_type?: string | null
  pickup?: boolean
  taxes_included?: boolean | null
  /** RFC 3339: the quote is valid until then. */
  expires_at?: string | null
}

export type PickupOption = { branch_id: string; name: string; address?: string | null; city?: string | null }

/** A rate provider that did not answer in time. */
export type UnavailableRateProvider = { provider: string; code: string }

export type DeliveryOptions = {
  /** Empty until the cart has a shipping address. Cheapest first. */
  rates: ShippingRate[]
  pickup: PickupOption[]
  /** `true` when some provider failed: `rates` holds only what arrived. */
  partial?: boolean
  unavailable?: UnavailableRateProvider[]
}

/** One way to pay (`GET /storefront/carts/:id/payment-methods`). `key` is sent as `payment_method` at checkout. */
export type PaymentMethod = {
  key: string
  /** `builtin` (manual transfer/cash) or `provider` (a payment addon). */
  kind: 'builtin' | 'provider'
  default: boolean
}

export type PaymentMethods = {
  methods: PaymentMethod[]
  /** Market the request acted in; `null` when none. */
  market: string | null
}

export type DeliveryInput = { method: DeliveryMethod; rate_id?: string; branch_id?: string }

export type InvoiceRequest = {
  requested?: boolean
  tax_id?: string
  legal_name?: string
  tax_regime?: string
  /** CFDI use. */
  use?: string
  postal_code?: string
  /** Spanish aliases the API also accepts. */
  rfc?: string
  razon_social?: string
  regimen?: string
  uso_cfdi?: string
  cp?: string
  [key: string]: unknown
}

export type CheckoutInput = {
  /** `manual` or the `key` of a method from `carts.paymentMethods`. */
  payment_method: string
  invoice?: InvoiceRequest
  /** Absolute URL; the API appends `?checkout=<id>` to it. */
  return_url: string
  note?: string
}

export type CheckoutPayment = {
  provider: string
  status: string
  redirect_url?: string | null
  client_secret?: string | null
  /** What to do next (provider addons): `redirect`, `embed`, `voucher` or `none`. */
  action_type?: string | null
  /** Isolated iframe URL of an embedded payment widget. */
  embed_url?: string | null
  /** Offline instructions as data (OXXO reference, SPEI CLABE, deadline...). */
  instructions_data?: Record<string, unknown>
  /** Offline payment instructions (OXXO reference, SPEI CLABE, manual transfer data) as text; `null` when none. */
  instructions?: string | null
}

export type CheckoutInfo = {
  /** Checkout session id; use it with `payment.instructions`. */
  id: string
  /** e.g. `pending`, `paid`, `failed`, `cancelled`, `converted`. */
  status: string
  external_order_id: string
  /** Amount to charge, computed by OPS (includes shipping and taxes). */
  total: Money
  /** RFC 3339. Stock is held until then; `null` when nothing is held. */
  stock_hold_expires_at: string | null
}

export type CheckoutResult = {
  /** `number` is `null` until the order exists in OPS (it is created asynchronously after checkout). */
  order: { id: string; number: string | null }
  payment: CheckoutPayment
  checkout: CheckoutInfo
}


// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

export type Customer = {
  id: string
  email: string | null
  phone: string | null
  first_name: string | null
  last_name: string | null
  default_address_id: string | null
  created_at: string
}

export type CustomerIdentifier = { email: string; phone?: never } | { phone: string; email?: never }

export type CustomerSessionInput = CustomerIdentifier & { code: string }

export type CustomerSession = { token: string; expires_at: string; customer: Customer }

export type OrderLine = {
  title: string
  variant_title: string | null
  sku: string | null
  quantity: number
  unit: Money
  total: Money
  image: Image | null
}

export type Order = {
  id: string
  number: string
  status: string
  created_at: string
  total: Money
  lines: OrderLine[]
}

export type ReturnRequestInput = {
  lines: { sku: string; quantity: number }[]
  reason?: string
}

export type ReturnRequest = { id: string; order_id: string; status: string }

export type InvoiceResult = { status: string; url?: string | null }

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export type Theme = {
  /** Design tokens, e.g. `{ primary: '#0f766e', 'primary-foreground': '#ffffff' }`. */
  tokens: Record<string, string>
  /** Font roles, e.g. `{ heading: 'Inter', body: 'Inter' }`. */
  fonts: Record<string, string>
  /** Base radius as a CSS length, e.g. `0.5rem`. */
  radius: string
}

export type Section<P extends Record<string, unknown> = Record<string, unknown>> = {
  id: string
  type: string
  props: P
}

export type Page = {
  handle: string
  title: string
  seo: SEO
  sections: Section[]
}

export type MenuItem = { title: string; url: string; items?: MenuItem[] }

export type Menu = { handle?: string; items: MenuItem[] }

export type Article = {
  id: string
  handle: string
  title: string
  excerpt: string | null
  content_html: string
  image: Image | null
  author: string | null
  tags: string[]
  published_at: string
  seo: SEO
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type StorefrontErrorCode =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'insufficient_stock'
  | 'price_mismatch'
  | 'invalid_state'
  | 'rate_limited'
  | 'not_modified'
  | 'server_error'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'invalid_response'
  | (string & {})

export type StorefrontErrorBody = {
  error: { code: StorefrontErrorCode; message: string; field?: string }
}
