/**
 * Storefront API v1 contract types.
 *
 * Field names match the wire format exactly (snake_case). Money amounts are
 * decimal strings ("1899.00") so no precision is lost in transit.
 */

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
  cost: { total: Money; unit: Money; compare_at_unit: Money | null }
}

export type CartDiscountCode = { code: string; applicable: boolean }

export type CartBuyer = { email: string | null; phone: string | null; customer_id: string | null }

export type DeliveryMethod = 'shipping' | 'pickup'

export type CartDelivery = {
  method: DeliveryMethod | null
  rate_id: string | null
  branch_id: string | null
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
  lines: CartLine[]
  total_quantity: number
  discount_codes: CartDiscountCode[]
  buyer: CartBuyer
  shipping_address: Address | null
  delivery: CartDelivery
  cost: CartCost
  updated_at: string
}

export type CartLineInput = { variant_id: string; quantity: number }

export type CartLineUpdateInput = { id: string; quantity: number }

export type CartBuyerInput = { email?: string | null; phone?: string | null }

export type ShippingRate = { id: string; title: string; cost: Money; eta: string | null }

export type PickupOption = { branch_id: string; name: string }

export type DeliveryOptions = { rates: ShippingRate[]; pickup: PickupOption[] }

export type DeliveryInput = { method: DeliveryMethod; rate_id?: string; branch_id?: string }

export type InvoiceRequest = {
  rfc?: string
  legal_name?: string
  tax_regime?: string
  zip?: string
  cfdi_use?: string
  email?: string
  [key: string]: unknown
}

export type CheckoutInput = {
  payment_method: string
  invoice?: InvoiceRequest
  return_url: string
}

export type CheckoutPayment = {
  provider: string
  status: string
  redirect_url?: string | null
  client_secret?: string | null
  /** Offline payment instructions (OXXO reference, SPEI CLABE, manual transfer data) as text; `null` when none. */
  instructions?: string | null
}

export type CheckoutInfo = {
  /** Checkout session id; use it with `carts.checkoutStatus` / `checkouts.get`. */
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

/** Guest-safe view of a checkout (`GET /storefront/checkouts/:id`). No address, email or phone. */
export type CheckoutStatus = CheckoutResult & {
  created_at: string
  lines: OrderLine[]
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
