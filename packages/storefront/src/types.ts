/**
 * Storefront API v1 contract types.
 *
 * Field names match the wire format exactly (snake_case). Money amounts are
 * decimal strings ("1899.00") so no precision is lost in transit.
 */

import type { CustomerPreferences } from './account-settings.js'
import type { OpeningHours } from './geo.js'

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type Money = { amount: string; currency_code: string }

export type Image = { url: string; alt: string | null; width?: number; height?: number }

export type SEO = { title: string | null; description: string | null }

export type PageInfo = {
  has_next_page: boolean
  end_cursor: string | null
  /** Contract 1.19, account lists: there is a page before this one (use `before` with `start_cursor`). */
  has_previous_page?: boolean
  /** Contract 1.19, account lists: the cursor of the first node, for `before`. */
  start_cursor?: string | null
}

export type Connection<T> = { nodes: T[]; page_info: PageInfo; total_count?: number }

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export type ProductOption = { name: string; values: string[] }

export type SelectedOption = { name: string; value: string }

/**
 * Server-resolved availability state (stock policy of the market x `show_stock`).
 * The storefront never computes it. Treat an unknown value as `out_of_stock`.
 */
export type AvailabilityStatus = 'in_stock' | 'low_stock' | 'out_of_stock' | 'backorder' | 'preorder'

/**
 * Availability of a variant (or the summary of a product). `quantity` and
 * `max_per_order` are already filtered by the shop's `show_stock`: with `none`
 * or `in_stock_label` the quantity is always `null`. Never infer a number from
 * any other field.
 */
export type Availability = {
  status: AvailabilityStatus
  /** Units the buyer may see; `null` when hidden. With `low_stock_threshold:N` it only comes when `status` is `low_stock`. */
  quantity: number | null
  /** Max per order: min(max line quantity, visible quantity). `null` = no cap to show. */
  max_per_order: number | null
  /** `YYYY-MM-DD`, only `backorder` / `preorder`, when OPS knows it. */
  restock_eta: string | null
  /** RFC 3339, release of a `preorder`. */
  preorder_release_at: string | null
  /** The buyer can subscribe to "notify me when it is back" (`restock.subscribe`). */
  notify_available: boolean
}

export type ProductVariant = {
  id: string
  sku: string
  title: string
  selected_options: SelectedOption[]
  price: Money
  compare_at_price: Money | null
  /** Derived from `availability.status` when the server sends it. */
  available_for_sale: boolean
  /** `null` when the stock is not tracked. Derived from `availability.quantity` when the server sends it. */
  quantity_available: number | null
  /** Absent on servers older than contract 1.1: use `resolveAvailability` to polyfill it. */
  availability?: Availability
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
  /** Summary: the best state among the variants. Absent on servers older than contract 1.1. */
  availability?: Availability
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
export type StockLevel = { sku: string; quantity_available: number | null; availability?: Availability }

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
  /** Postal code of the branch. Comes with `locations.v1`. */
  postal_code?: string | null
  /** What kind of place it is. Comes with `locations.v1`. */
  kind?: LocationKind
  /** What can be done there (free-form keys such as `pickup`, `returns`, `repairs`). Comes with `locations.v1`. */
  services?: string[]
  /** Contact channels of the branch. Comes with `locations.v1`. */
  contacts?: LocationContacts
  /** Pickup ("recoge en sucursal") terms. Comes with `locations.v1`. */
  pickup?: LocationPickup
}

export type LocationKind = 'store' | 'warehouse' | 'pickup_point' | 'office' | (string & {})

export type LocationContacts = { phone: string | null; email: string | null; whatsapp: string | null }

/** `fee` is `null` when pickup is free. `prep_days`: days until the order is ready (0 = same day). */
export type LocationPickup = { enabled: boolean; fee: Money | null; prep_days: number }

/**
 * A branch as served by `/storefront/locations` (`locations.v1`): a `ShopBranch`
 * whose structured fields are always present. `distance_km` is set only when
 * the answer is ordered by distance (`nearest`, or `list` with `postal_code`).
 */
export type Location = ShopBranch &
  Required<Pick<ShopBranch, 'kind' | 'services' | 'contacts' | 'pickup' | 'postal_code'>> & {
    distance_km?: number | null
  }

/** Answer of `locations.nearest`: always ordered by distance, closest first. */
export type NearestLocation = Location & { distance_km: number }

export type LocationListParams = {
  /** Orders the branches by distance to the centroid of this postal code. */
  postal_code?: string
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

/** Why a cart line cannot be bought as it is. `max_quantity` is `null` when `show_stock` hides it. */
export type CartLineProblem = { code: 'out_of_stock' | 'insufficient_stock'; max_quantity: number | null }

export type CartLine = {
  id: string
  quantity: number
  merchandise: CartLineMerchandise
  /** Computed when the cart is read, before checkout. `null`/absent = fine. */
  problem?: CartLineProblem | null
  /** Ship date computed by OPS (`YYYY-MM-DD`). Absent/`null` = no date to show. */
  ships_on?: string | null
  /** Availability of the line's variant; only used as a fallback for the ship date. */
  availability?: Pick<Availability, 'status' | 'restock_eta' | 'preorder_release_at'>
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
  /** Total discount (automatic tiers + codes). Use `discounts` to label each one. */
  discount: Money
  /** One entry per applied discount (contract 1.2). Absent on older servers. */
  discounts?: CartDiscountLine[]
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
  /** Automatic-discount tiers and free-shipping progress (contract 1.2); `null`/absent without the promotions addon. */
  promotions?: CartPromotions | null
  /** Invoice the buyer asked for (`carts.setInvoice`); `null`/absent when none. */
  invoice?: CartInvoice | null
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
  /** The shop's own fixed price: no carrier was asked (addon setting `shipping_quote_mode`). */
  fixed?: boolean
  /** Every shipping rate costs 0 (free-shipping minimum reached): nothing to choose, show "Free shipping" and go on. */
  free?: boolean
}

/** One way to pay (`GET /storefront/carts/:id/payment-methods`). `key` is sent as `payment_method` at checkout. */
export type PaymentMethod = {
  key: string
  /** `builtin` (manual transfer/cash) or `provider` (a payment addon). */
  kind: 'builtin' | 'provider'
  default: boolean
  /** Embedded-payment options the provider offers (contract 1.2). Absent: fall back to a redirect. */
  options?: PaymentOption[]
  /** Public data to mount the provider form in the browser (contract 1.2). */
  client?: PaymentClient
}

export type PaymentMethods = {
  methods: PaymentMethod[]
  /** Market the request acted in; `null` when none. */
  market: string | null
}

export type DeliveryInput = { method: DeliveryMethod; rate_id?: string; branch_id?: string }

/**
 * Fiscal data the buyer asks an invoice for. The Spanish aliases are still accepted by the API.
 * `document` is the evidence of where the data came from (never the document itself).
 */
export type InvoiceRequest = {
  requested?: boolean
  tax_id?: string
  legal_name?: string
  tax_regime?: string
  /** Invoice use; the region says which are allowed for `tax_regime`. */
  use?: string
  postal_code?: string
  /** Defaults to the market's country. */
  country_code?: string
  document?: FiscalDocumentEvidence
  /** Spanish aliases the API also accepts. */
  rfc?: string
  razon_social?: string
  regimen?: string
  uso_cfdi?: string
  cp?: string
  /** Alias of `postal_code`, already in production use by some storefronts. */
  zip?: string
  /** Alias of `use`, already in production use by some storefronts. */
  cfdi_use?: string
  /** Alias of `use`. */
  invoice_use?: string
  /** Also save the data to the buyer's account (needs a session). */
  save?: boolean
  /** Saved fiscal profile the data comes from (contract 1.9; needs a session; `404` when it is not the buyer's). */
  profile_id?: string
  [key: string]: unknown
}

export type CheckoutInput = {
  /** `manual` or the `key` of a method from `carts.paymentMethods`. */
  payment_method: string
  invoice?: InvoiceRequest
  /** Absolute URL; the API appends `?checkout=<id>` to it. */
  return_url: string
  note?: string
  /** `embedded` pays in the page (`checkouts.pay`); `redirect` (default) sends the buyer to the provider. */
  payment_flow?: PaymentFlow
  /** The option the buyer chose; one of `PaymentMethod.options[].key`. */
  payment_option?: PaymentOptionKey
  /** The total the buyer saw. A different server total answers `422 price_mismatch`. */
  expected_total?: Money
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
  /** `embedded` when the buyer pays in the page (contract 1.2). */
  flow?: PaymentFlow
  /** Public data to mount the provider form. */
  client?: PaymentClient
  /** Pending action of the last attempt (voucher, 3DS challenge). */
  action?: PaymentAction | null
  /**
   * Only on `GET checkouts/:id` when the LATEST attempt was rejected (e.g. the bank failed the 3DS challenge): the checkout
   * stays `pending` (a new attempt is allowed) but `outcome` is `rejected`, with the typed reason and next step.
   */
  outcome?: string | null
  decline_code?: DeclineCode | null
  next_step?: PaymentNextStep | null
  retryable?: boolean | null
  message?: string | null
  message_en?: string | null
  attempts_left?: number | null
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
  /** Saved fiscal data; `null`/absent when none. */
  fiscal?: FiscalIdentity | null
  created_at: string
  /**
   * The buyer proved they control `email` with a code (contract 1.15). `false` for an account registered without
   * verification (the store had no mail connector) and when there is no e-mail. Absent on older servers: say nothing.
   */
  email_verified?: boolean
  /** Preferred language, one of the store's (contract 1.9). Absent on older servers. */
  locale?: string | null
  /** Notification preferences (contract 1.9). Absent on older servers. */
  preferences?: CustomerPreferences
}

export type CustomerIdentifier = { email: string; phone?: never } | { phone: string; email?: never }

export type CustomerSessionInput = CustomerIdentifier & { code: string }

export type CustomerSession = { token: string; expires_at: string; customer: Customer }

/** What the store's buyer accounts support (`GET /storefront/customer/capabilities`). Cache briefly, not forever. */
export type CustomerCapabilities = {
  /** Email + password registration and login are enabled. */
  password: boolean
  /** Registration needs an emailed code (`customer.verifyRegistration`) before the account exists. */
  email_verification: boolean
  /** Channels `customer.requestOtp` can deliver the code through. */
  otp_channels: ('email' | 'whatsapp')[]
  /** What invoicing the store offers. Absent on older servers: treat as `available: false`. */
  invoicing?: InvoicingCapabilities
  /**
   * Why a way of signing in is off. `missing_scope`: the store's token lacks a scope (see `missing_scopes`), so
   * the store is misconfigured; it is not a choice of the merchant. Absent when everything is as configured.
   */
  unavailable_reason?: 'missing_scope' | (string & {})
  /** Scopes the token lacks (e.g. `customer:write`) when `unavailable_reason` is `missing_scope`. */
  missing_scopes?: string[]
  /** Saved fiscal profiles (contract 1.9). Absent on older servers: the section does not exist. */
  fiscal_profiles?: { max: number }
  /**
   * The kinds of saved item the store declares («My items»; contract 1.9). Absent when the store declares none (or on
   * older servers): there is no such section, show nothing.
   */
  subjects?: { kinds: string[]; share_with_workshop?: boolean }
  /** Channels the notification preferences can use (connector installed). Absent on older servers: no preferences section. */
  notifications?: { channels: string[] }
  /** The buyer can download their data (`customer.exportData`). Absent on older servers. */
  data_export?: boolean
  /** The buyer can delete their account (`customer.deleteAccount`). Absent on older servers. */
  account_delete?: boolean
  /**
   * The buyer can verify and change their e-mail from the account (`customer.email`; contract 1.15). It needs mail
   * delivery, because the code goes to the NEW address. Absent on older servers: there is no such section.
   */
  email_change?: boolean
}

/** `GET {gateway}/_token`: what the token in use is and what it can do. Needs no scope. */
export type TokenIntrospection = {
  kind: string
  environment: 'sandbox' | 'production' | (string & {}) | null
  scopes: string[]
  /** Scopes the connection should have but the token lacks. Empty when healthy. */
  missing_scopes: string[]
  connection_id: string | null
  expires_at: string | null
}

export type CustomerRegisterInput = {
  email: string
  password: string
  first_name?: string
  last_name?: string
}

/** `verification_required`: a code was emailed, finish with `customer.verifyRegistration`. `created`: the account is ready and signed in. */
export type CustomerRegisterResult =
  | { status: 'verification_required' }
  | { status: 'created'; session: CustomerSession }

export type CustomerVerifyRegistrationInput = { email: string; code: string }

export type CustomerPasswordLoginInput = { email: string; password: string }

/** `current_password` is required by the server when the account already has a password. */
export type CustomerSetPasswordInput = { password: string; current_password?: string }

/** `customer.email.confirmVerification`: the 6-digit code mailed to the current address. */
export type CustomerEmailCodeInput = { code: string }
/** `customer.email.requestChange`: the new address. */
export type CustomerEmailChangeInput = { email: string }
/** `customer.email.confirmChange`: the same new address and the code that arrived there. */
export type CustomerEmailChangeConfirmInput = { email: string; code: string }
/** The answer to asking for a change: always this, whether or not the new address has an account. */
export type CustomerEmailChangeRequested = { status: 'verification_required' }

export type CustomerResetPasswordInput = { email: string; code: string; password: string }

export type OrderLine = {
  title: string
  variant_title: string | null
  sku: string | null
  quantity: number
  unit: Money
  total: Money
  image: Image | null
}

/**
 * Enums the server may grow (contract 1.8): every union here keeps `(string & {})`, so a value this SDK does not know
 * type-checks and the UI shows a safe fallback instead of breaking.
 */
export type OrderStage =
  | 'pending_payment'
  | 'paid'
  | 'preparing'
  | 'ready_for_pickup'
  | 'shipped'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'refunded'
  | (string & {})

export type OrderStepKey = 'paid' | 'preparing' | 'ready_for_pickup' | 'shipped' | 'in_transit' | 'delivered' | (string & {})

export type OrderStepState = 'done' | 'current' | 'pending' | 'problem' | (string & {})

export type OrderProgressStep = { key: OrderStepKey; state: OrderStepState; at?: string | null }

/** What stops the order. `code` is open: `delivery_exception`, `returned`, `lost`, `payment_failed`, ... */
export type OrderProblem = { code: string; at?: string | null }

/** Unified timeline of the order (payment, preparation, shipping, delivery). */
export type OrderProgress = {
  stage: OrderStage
  problem?: OrderProblem | null
  steps: OrderProgressStep[]
}

export type NextActionKind =
  | 'pay'
  | 'track'
  | 'pickup'
  | 'download_invoice'
  | 'request_invoice'
  | 'correct_invoice_data'
  | 'contact_store'
  | 'none'
  | (string & {})

/** The one thing the store should offer the buyer on this order. `href` is `https` only (tracking or voucher). */
export type NextAction = {
  kind: NextActionKind
  href?: string | null
  /** Id of the shipment or invoice the action points at. */
  ref?: string | null
}

export type ShipmentStatus =
  | 'pending'
  | 'label_created'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'exception'
  | 'returned'
  | 'lost'
  | 'cancelled'
  | (string & {})

export type ShipmentKind = 'outbound' | 'return' | 'pickup' | 'local' | (string & {})

export type ShipmentEvent = {
  id: string
  status: ShipmentStatus
  description?: string | null
  /** City / state text; never an address. */
  location?: string | null
  occurred_at: string
  source?: 'carrier' | 'store' | null | (string & {})
}

/** Approximate point (city or state), rounded by the server. Never an address. */
export type GeoHint = { label: string; lat: number; lng: number; precision: 'city' | 'state' | (string & {}) }

export type ShipmentMap = {
  origin?: GeoHint | null
  destination?: GeoHint | null
  path?: GeoHint[]
}

/**
 * A shipment as the buyer sees it. A `test_mode` shipment (sandbox) is never shown as real: hide it or mark it
 * "test". `label_url` exists only on `kind: 'return'`.
 */
export type Shipment = {
  id: string
  number?: string | null
  kind: ShipmentKind
  status: ShipmentStatus
  environment?: 'production' | 'sandbox' | (string & {})
  test_mode?: boolean
  carrier?: string | null
  /** Key of the carrier logo in the SDK brand set (`dhl`, `estafeta`...). */
  carrier_logo_key?: string | null
  service?: string | null
  tracking_number?: string | null
  /** `https` only. */
  tracking_url?: string | null
  shipped_at?: string | null
  delivered_at?: string | null
  /** `YYYY-MM-DD`. */
  promised_by?: string | null
  label_url?: string | null
  /** At most 50, newest first. */
  events: ShipmentEvent[]
  map?: ShipmentMap | null
}

/** A scan of the public tracking view. `lat` / `lng` only when the carrier reports coordinates (city precision at most). */
export type TrackingEventView = ShipmentEvent & { lat?: number | null; lng?: number | null }

/**
 * What the public "track my order" lookup returns: only the movement of the parcel. Never a name, an address, the lines
 * or the totals of the order, and never a `label_url`. `events` is newest first.
 */
export type TrackingView = {
  status: ShipmentStatus
  carrier?: string | null
  carrier_logo_key?: string | null
  tracking_number?: string | null
  /** `https` only. */
  tracking_url?: string | null
  /** `YYYY-MM-DD` or an instant. */
  eta?: string | null
  updated_at?: string | null
  events: TrackingEventView[]
  map?: ShipmentMap | null
}

/** Order number + the email of the order, or only the guide printed on the parcel. */
export type TrackingLookupInput = { order_number: string; email: string } | { tracking_number: string }

/** One shape for every failure so the answer never tells an existing order from a missing one. */
export type TrackingLookupResult =
  | { status: 'found'; tracking: TrackingView }
  | { status: 'not_found' | 'unavailable' }
  | { status: 'rate_limited'; retryAfter?: number }

/** List-view summary of the shipments of an order. */
export type ShipmentsSummary = {
  count: number
  status: ShipmentStatus
  carrier?: string | null
  tracking_url?: string | null
}

/** Receiver of an issued invoice (contract 1.14): the fiscal data the buyer themselves gave. Never the issuer's. */
export type InvoiceReceiver = {
  /** Tax id of the receiver (MX: RFC). */
  rfc?: string | null
  /** Legal name. */
  name?: string | null
  /** Tax regime (MX: SAT code). */
  tax_regime?: string | null
  /** Use of the invoice (MX: UsoCFDI). */
  cfdi_use?: string | null
  /** Postal code of the fiscal address. */
  postal_code?: string | null
}

/** An invoice or credit note of an order (extends `InvoiceSummary`). Links, when present, are short-lived and never the PAC's. */
export type InvoiceDoc = InvoiceSummary & {
  id: string
  /** `issued | pending | cancelled | error` (open). */
  status: 'issued' | 'pending' | 'cancelled' | 'error' | (string & {})
  kind: 'invoice' | 'credit_note' | (string & {})
  total?: Money | null
  issued_at?: string | null
  cancelled_at?: string | null
  series?: string | null
  folio_number?: string | null
  /** Id of the invoice a credit note corrects. */
  related_to?: string | null
  links_expire_at?: string | null
  /** Contract 1.14, issued invoices: payment method (MX: `PUE` | `PPD`). Absent = the server does not say. */
  payment_method?: string | null
  /** Contract 1.14: payment form (MX: SAT code such as `04`). */
  payment_form?: string | null
  /** Contract 1.14: who the invoice was issued to. */
  receiver?: InvoiceReceiver | null
  /** Invoice from a sandbox PAC: hide it or mark it "test, no fiscal validity". */
  test_mode?: boolean
  environment?: 'production' | 'sandbox' | (string & {})
}

export type PaymentInfo = {
  method_label: string
  family?: 'card' | 'cash_voucher' | 'transfer' | 'wallet' | 'other' | null | (string & {})
  status: 'paid' | 'pending' | 'failed' | 'refunded' | 'partially_refunded' | (string & {})
  amount: Money
  paid_at?: string | null
  /** Card brand (`visa`, `mastercard`...) when the server knows it. */
  brand?: string | null
  /** Last four digits of the card when the server knows them. */
  last4?: string | null
}

export type Refund = {
  id: string
  amount: Money
  status: 'requested' | 'processing' | 'completed' | 'failed' | (string & {})
  method_label?: string | null
  created_at: string
  completed_at?: string | null
  return_id?: string | null
}

/** A section of the order the server could not read; the rest of the order is still valid. */
export type OrderSection = 'shipments' | 'invoices' | 'payments' | 'refunds' | (string & {})

export type OrderPickup = {
  location_id?: string | null
  name?: string | null
  address?: string | null
  city?: string | null
  phone?: string | null
  ready_at?: string | null
  delivered_at?: string | null
}

/**
 * The delivery the buyer chose at checkout, as they saw it (contract 1.11). It comes from the order's frozen quote, not
 * from a shipment: it exists before any guide or tracking does, and for a sandbox shipment too. Never a cost or a
 * provider id. Open text: `carrier` is whatever the shipping addon stored (`paquetexpress`, `DHL Express`).
 */
export type OrderShippingService = {
  /** Service name the buyer picked («Envío Paquetexpress»). */
  title?: string | null
  carrier?: string | null
  /** Key of the carrier logo in the SDK brand set (`dhl`, `estafeta`...); unknown keys fall back to the name. */
  carrier_logo_key?: string | null
  /** Estimated business days when the buyer chose (whole numbers, `min <= max`). */
  eta_days_min?: number | null
  eta_days_max?: number | null
}

export type Order = {
  id: string
  number: string
  /** Open: `placed`, `paid`, `shipped`, `fulfilled`... Prefer `progress`. */
  status: string
  created_at: string
  total: Money
  lines: OrderLine[]
  /** Invoice state; absent on older servers. */
  invoice?: InvoiceSummary
  delivery_method?: 'shipping' | 'pickup' | null | (string & {})
  pickup?: OrderPickup | null
  payment_status?: string | null
  subtotal?: Money
  tax?: Money
  shipping?: Money
  discount?: Money
  tax_included?: boolean
  shipping_method?: string | null
  /** Detail only, contract 1.11: the carrier, service and estimated days the buyer chose; absent on older servers (use `shipping_method`). */
  shipping_service?: OrderShippingService | null
  /** Detail only: the address as the checkout captured it (the buyer's own). */
  shipping_address?: Record<string, unknown> | null
  /** @deprecated Use `shipments[0].tracking_number`: it does not say if it is a sandbox guide. */
  tracking?: string | null
  /** @deprecated Use `shipments`. */
  fulfillments?: { status: string; tracking?: string | null; shipped_at?: string | null }[]
  returns?: { id: string; status: string; created_at?: string | null }[]
  /** Servers older than contract 1.8 omit it: use `orderProgress(order)`. */
  progress?: OrderProgress
  /** Servers older than contract 1.8 omit it: use `nextAction(order)`. */
  next_action?: NextAction | null
  /** Detail only. */
  shipments?: Shipment[]
  /** List only (the detail carries `shipments`). */
  shipments_summary?: ShipmentsSummary
  /** Detail only: invoices and credit notes. */
  invoices?: InvoiceDoc[]
  /** Detail only. */
  payments?: PaymentInfo[]
  /** Detail only. */
  refunds?: Refund[]
  /** Sections that could not be read (`shipments`, `invoices`...): show a retry there, the rest is fine. */
  degraded?: OrderSection[]
}

/** Cash voucher of a payment still waiting (OXXO, SPEI...). */
export type PendingPaymentVoucher = {
  provider?: string | null
  method?: string | null
  reference: string | null
  barcode: string | null
  clabe: string | null
  /** `https` only. */
  voucher_url?: string | null
  instructions?: string | null
  expires_at: string | null
  amount: Money
}

/** A checkout waiting for its payment: there is no order yet (the order exists once the payment confirms). */
export type PendingPayment = {
  /** Checkout id. */
  id: string
  number: null
  status: 'pending_payment' | 'expired' | (string & {})
  created_at: string
  total: Money
  expires_at: string | null
  payment: PendingPaymentVoucher
}

/**
 * A file of an invoice (`pdf` or `xml`), already read on the server so the browser never sees the buyer token nor a URL
 * of the PAC. Serve it from your own route: `invoiceFileBytes(file)` gives the bytes.
 */
export type InvoiceFile = {
  filename: string
  content_type: string
  content_base64: string
}

export type InvoiceFileKind = 'pdf' | 'xml'

export type ReturnRequestInput = {
  lines: { sku: string; quantity: number }[]
  reason?: string
}

export type ReturnRequest = { id: string; order_id: string; status: string }

/** `200` issued, `202` pending. The 422 / 409 / 503 outcomes arrive as a `StorefrontError`. */
export type InvoiceResult = { status: string; url?: string | null; stage?: InvoiceStage; invoice?: InvoiceSummary }

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
  /** `403`: the token lacks a scope the route needs. `StorefrontError.requiredScopes` lists them. */
  | 'insufficient_scope'
  | (string & {})

/** One affected line of a `409 insufficient_stock`. `line_id` is `null` when the line did not exist yet (add). */
export type InsufficientStockLine = {
  line_id: string | null
  variant_id: string
  sku: string
  status: AvailabilityStatus
  max_quantity: number | null
}

export type InsufficientStockDetails = { lines: InsufficientStockLine[] }

export type StorefrontErrorBody = {
  error: {
    code: StorefrontErrorCode
    message: string
    field?: string
    details?: unknown
    required_scopes?: string[]
    /** Payment failures only: `true` = repeating the request can succeed; `false` = not until someone fixes something. */
    retryable?: boolean
    /** Seconds to wait before retrying (`too_many_attempts`, `payment_in_progress`). */
    retry_after?: number
    /** A cart write refused because the cart already became a checkout that can still be paid. */
    checkout_id?: string
    /** The cart's current cost, sent with `price_mismatch`. */
    cost?: unknown
    /** The same message in English, when the server provides it. */
    message_en?: string
  }
}

export type RestockSubscriptionInput = {
  sku: string
  /** At least one of `email` / `phone`. */
  email?: string
  phone?: string
  /** Language of the notice, e.g. `es-MX`. */
  locale: string
  market?: string
  /** Explicit consent to receive the notice. */
  consent: true
}

export type RestockSubscriptionResult = { status: 'pending' }


// ---------------------------------------------------------------------------
// Embedded payment (contract 1.2 — DISENO-PAGO-INTEGRADO-BRICKS)
// ---------------------------------------------------------------------------

export type PaymentFlow = 'redirect' | 'embedded'

/** `card` and `cash` are paid in the page; `wallet` and `credits` always leave it (provider account). */
export type PaymentOptionKey = 'card' | 'cash' | 'wallet' | 'credits'

/** A cash point (OXXO, 7 Eleven...). The list comes from the provider, never from the shop code. */
export type PaymentPoint = {
  id: string
  payment_method_id: string
  payment_point?: string | null
  label: string
  logo_url?: string | null
  group: 'main' | 'more'
}

export type PaymentOption = {
  key: PaymentOptionKey
  family?: string
  /** Provider label, e.g. "Tarjeta de crédito o débito". */
  label?: string
  /** `true`: choosing it sends the buyer to the provider. */
  redirect: boolean
  max_installments?: number
  points?: PaymentPoint[]
  /** Provider-supplied promo text, e.g. "up to 12 payments". */
  label_max?: string | null
}

/** Origins the provider needs in the page's CSP, declared by the provider. */
export type PaymentClientCsp = {
  script?: string[]
  frame?: string[]
  connect?: string[]
  img?: string[]
  form?: string[]
}

/** Public data to mount a provider form. `public_key` is public by design; never a secret. */
export type PaymentClient = {
  /** Adapter key, e.g. `mercadopago_bricks`. */
  kind: string
  sdk_url: string
  public_key: string
  locale?: string
  market?: string
  options?: PaymentOption[]
  csp?: PaymentClientCsp
  test_mode?: boolean
}

/** Neutral reasons for a rejected payment (provider codes are translated server-side). */
export type DeclineCode =
  | 'insufficient_funds'
  | 'invalid_cvc'
  | 'invalid_expiry'
  | 'invalid_card_data'
  | 'call_issuer'
  | 'card_disabled'
  | 'duplicate'
  | 'max_attempts'
  | 'authentication_failed'
  | 'declined'

export type PaymentVoucher = {
  payment_point: string
  reference: string
  /** https page with the printable voucher. */
  voucher_url?: string | null
  barcode?: string | null
  clabe?: string | null
  /** The exact amount to pay. The cart sends a decimal string plus `currency`; a `Money` object is also accepted. */
  amount?: Money | string | number
  currency?: string
  /** RFC 3339. */
  expires_at?: string | null
}

export type PaymentAction = {
  type: 'none' | 'challenge' | 'voucher' | 'redirect'
  challenge?: { url?: string; creq?: string } | null
  voucher?: PaymentVoucher | null
  redirect_url?: string | null
}

export type PaymentAttemptStatus =
  | 'paid'
  | 'pending'
  | 'requires_action'
  | 'failed'
  | 'expired'
  | 'cancelled'
  /** Only from the shop's status route: there is no payment session in this browser (cookie gone). It is NOT a result. */
  | 'none'

/** What the buyer should do next after a rejection (stable enum from the cart). */
export type PaymentNextStep = 'retry' | 'fix_card_data' | 'use_other_card' | 'pay_cash' | 'contact_issuer' | 'check_email' | 'rebuild_cart'

/** `POST /storefront/checkouts/:id/payment`. The amount is the server's; the browser only brings `provider_data`. */
export type PaymentSubmitInput = {
  method: 'card' | 'cash' | 'bank_transfer'
  /** What the provider SDK gave the browser (token, payment_method_id...). Never logged or stored. */
  provider_data: Record<string, unknown>
  device_session_id?: string
  /** The total the buyer saw. */
  expected_total?: Money
}

export type PaymentAttemptResult = {
  payment: {
    provider: string
    status: PaymentAttemptStatus
    /** Server classification: `approved | pending | rejected | redirect | challenge`. */
    outcome?: string
    decline_code?: DeclineCode | null
    next_step?: PaymentNextStep | null
    retryable?: boolean
    /** Server-written texts (es / en). The helpers prefer the shop's own catalog but fall back to these. */
    message?: string | null
    message_en?: string | null
    action?: PaymentAction | null
  }
  checkout?: CheckoutInfo
  order?: { id?: string; number?: string | null }
  attempt?: { n: number }
  attempts_left?: number
  /** Only with `payment.status: 'none'`: the shop still has the buyer's cart, so repeating the SAME attempt can proceed. */
  recoverable?: boolean
}

/** `GET /storefront/checkouts/:id/payment-config`: what to mount for an embedded checkout. */
export type PaymentConfig = {
  provider: string
  flow: PaymentFlow
  option: PaymentOptionKey | null
  payable: boolean
  /** Why it is not payable: `not_embedded | paid | closed | expired | too_many_attempts | payment_in_progress`. */
  reason: string | null
  amount: Money
  currency: string
  public_key: string | null
  methods: string[]
  options: PaymentOption[]
  client: PaymentClient | null
  checkout: CheckoutInfo
  /** Pending voucher / challenge / redirect of an earlier attempt, to show again after a reload. */
  action: PaymentAction | null
  attempts_left: number
}

// ---------------------------------------------------------------------------
// Promotions (contract 1.2 — DISENO-VENTA-CRUZADA-Y-DESCUENTOS-ESCALONADOS)
// ---------------------------------------------------------------------------

export type PromotionReward =
  | { kind: 'percent'; percent: string }
  | { kind: 'fixed'; amount: Money }
  | { kind: 'free_shipping' }

export type PromotionTier = {
  id: string
  threshold: Money
  reward: PromotionReward
  reached: boolean
  /** Position of the milestone on the bar (0-100), computed by OPS. */
  percent_of_max: number
}

export type CartPromotions = {
  version: 1
  promotion_id: string
  title: string
  basis: Money
  tiers: PromotionTier[]
  applied: { tier_id: string; reward: PromotionReward; amount: Money } | null
  next_tier: { tier_id: string; threshold: Money; remaining: Money; reward: PromotionReward; percent: number } | null
  max_reached: boolean
  percent_of_max: number
  combines_with_codes: boolean
  ends_at: string | null
  excluded_line_ids: string[]
  suppressed: { reason: 'code_better' | 'list_final' | 'limit_reached' } | null
  free_shipping: {
    /** `0.00` = no minimum. */
    threshold: Money
    basis: Money
    remaining: Money
    reached: boolean
    percent: number
  } | null
}

export type CartDiscountLine = {
  kind: 'automatic' | 'code'
  id: string
  title: string
  code: string | null
  amount: Money
}

export type CartRecommendation = {
  product: Pick<Product, 'id' | 'handle' | 'title' | 'featured_image' | 'options' | 'vendor'>
  /** Only sellable variants, with the server price. */
  variants: ProductVariant[]
  default_variant_id: string
  source: 'curated' | 'bought_together' | 'bestseller' | 'similar'
  unlocks: { tier_id: string; reward: PromotionReward; remaining_after: Money } | null
}

export type CartRecommendations = { nodes: CartRecommendation[]; promotions: CartPromotions | null }

export type RecommendationPlacement = 'checkout_upsell' | 'cart' | 'drawer'

/** Public announcement behind the entry pop-up (`GET /storefront/promotions`). Amounts come from the engine. */
export type PromotionAnnouncement = {
  id: string
  version: number
  placement: 'entry_popup'
  headline: string
  subheadline?: string | null
  cta_label?: string | null
  /** Internal path. */
  cta_url?: string | null
  image?: { url: string; alt: string } | null
  tiers: { threshold: Money; reward: PromotionReward }[]
  free_shipping_threshold: Money | null
  /** Server-generated fine print. */
  legal_text: string
  combines_with_codes: boolean
  starts_at: string | null
  ends_at: string | null
  frequency?: 'session' | 'days' | 'campaign'
  frequency_days?: number
  trigger?: { delay_ms?: number; pageviews?: number; scroll_percent?: number }
}

export type PromotionsList = { nodes: unknown[]; announcements: PromotionAnnouncement[] }

// ---------------------------------------------------------------------------
// Region and fiscal identity (contract 1.6)
// ---------------------------------------------------------------------------

/** Where an invoice is. `needs_data`: the buyer must fix something. `needs_review`: the store must act. */
export type InvoiceStage =
  | 'not_requested'
  | 'requested'
  | 'awaiting_payment'
  | 'queued'
  | 'issuing'
  | 'issued'
  | 'cancelled'
  | 'needs_data'
  | 'retrying'
  | 'needs_review'
  | 'window_closed'
  | (string & {})

/** What the buyer can do next about an invoice. */
export type InvoiceAction = 'none' | 'request' | 'wait' | 'correct_data' | 'download' | 'contact_store' | (string & {})

export type InvoiceSummary = {
  /** Single-word status (`requested`, `issued`...). Prefer `stage`. */
  status: string
  stage?: InvoiceStage
  requested?: boolean
  /** Machine-readable cause when `stage` is `needs_data` / `needs_review` (e.g. `invoice.tax_regime`). */
  reason_code?: string | null
  action?: InvoiceAction
  /** The buyer may ask for it now. */
  can_request?: boolean
  /** Why `can_request` is `false` (e.g. `awaiting_payment`, `window_closed`, `not_invoiceable`). */
  blocked_reason?: string | null
  /** Fiscal folio (UUID in Mexico) once issued. */
  folio?: string | null
  /** Signed, short-lived download links. */
  url?: string | null
  xml_url?: string | null
  /**
   * Files the server can deliver NOW through the authenticated invoice file route (contract 1.13). The PDF can arrive
   * after the XML: a missing kind is "still being prepared", not an error. Absent/null = the server does not say.
   */
  available_files?: ('pdf' | 'xml')[] | null
  /**
   * Plain-words reason the invoice could not be issued, ready to show (contract 1.18): "No pudimos emitir tu factura: el nombre o
   * razón social no coincide con el SAT. Revisa tus datos y vuelve a intentarlo." Never the provider's text.
   */
  reason_message?: string | null
  /** Form field the authority refused (`tax_id`, `legal_name`, `tax_regime`, `postal_code`, `invoice_use`), to mark it. */
  reason_field?: 'tax_id' | 'legal_name' | 'tax_regime' | 'postal_code' | 'invoice_use' | (string & {}) | null
  /** The data the buyer sent in the refused attempt, to prefill the form for the correction. */
  submitted?: { tax_id?: string; legal_name?: string; tax_regime?: string; postal_code?: string; invoice_use?: string } | null
  /** Attempts left today for this order (0: `needs_review` until tomorrow). */
  retries_left?: number | null
}

/** The invoice request of a cart (`Cart.invoice`). The tax id is masked: the full value is never echoed back. */
export type CartInvoice = {
  requested: boolean
  tax_id_masked?: string | null
  legal_name?: string | null
  country_code?: string | null
  /** `IdentityDocumentSpec.kind` the data was read from, when it was. */
  document_kind?: string | null
}

export type InvoicingCapabilities = {
  available: boolean
  /** Countries (ISO 3166-1 alpha-2) the store can invoice for. */
  countries: string[]
  /** `optional`: the checkout offers "I need an invoice". `off`: invoices can only be requested afterwards. */
  checkout: 'off' | 'optional'
  /** Invoices can be requested after the purchase (`customer.requestInvoice`). */
  post_purchase: boolean
  /** Days after the purchase in which an invoice can still be requested. */
  window_days?: number
  /** `IdentityDocumentSpec.kind` values the buyer can upload to prefill the data. */
  identity_documents: string[]
  /** The store can check the data against the tax authority online (informative, never blocks). */
  online_verify: boolean
  /** Invoicing runs against a test (sandbox) provider: invoices have no fiscal validity. Absent = production. */
  test_mode?: boolean
}

/** One regime or invoice use of the region's fiscal catalog. */
export type RegionFiscalEntry = {
  code: string
  label: string
  label_en?: string
  /** Region-defined (`individual`, `company`...); compare as opaque strings. */
  person_types: string[]
  /** Invoice uses only: the regimes that may use it. Absent: any. */
  allowed_regimes?: string[]
  /** Folded phrases that identify the entry in a document (`catalog_phrases`); without them the label is used. */
  match_phrases?: string[]
  /**
   * Invoice uses only (contract 1.9): the regimes this use is SUGGESTED for. Region data, never a rule: the buyer can
   * change it and `allowed_regimes` still validates.
   */
  suggested_for_regimes?: string[]
}

/**
 * A document the buyer can upload to prefill their fiscal data, with the rules to read it. Published by the
 * region in `fiscal_id.documents[]` (texts already in the response locale); the SDK engine knows no country.
 */
export type IdentityDocumentSpec = {
  /** `<COUNTRY>:<kind>`. */
  kind: string
  country_code?: string
  label: string
  /** Explanation for the buyer; absent when the region has none in the response language. */
  help?: string
  /** Where the buyer gets the document from the authority. */
  obtain_url?: string
  /** MIME types the document comes in (the SDK reads PDFs). */
  accept: string[]
  /**
   * What can be read from a PHOTO of the document (contract 1.9): `qr_only` (the QR: tax id and document id) or
   * `full`. Absent or `none`: files only.
   */
  image_mode?: 'none' | 'qr_only' | 'full'

  max_bytes: number
  max_pages?: number
  /** `rules@1` runs the generic engine on `rules`; `plugin:<id>` runs an extractor from `registerIdentityExtractor`. */
  engine: 'rules@1' | `plugin:${string}` | (string & {})
  /** The `rules@1` rules (the API publishes them as an object; JSON text is accepted too). */
  rules?: IdentityRulesV1 | string | null
  /** How the server can check the document against the authority (e.g. `qr_validator`). Informative. */
  verify_kind?: string
  /** Days after `issued_on` in which the document counts as fresh. */
  freshness_days?: number
  /** Fields the extractor never returns (sensitive data the store has no use for). */
  discard_fields: string[]
}

/** Region fiscal identity (`Region.fiscal_id`). */
export type RegionFiscalId = {
  /** Name of the tax id (`RFC`, `EIN`...). */
  kind: string
  label: string
  /** Regular expression a valid tax id matches. */
  pattern?: string
  /** Generic ids valid without a document (e.g. the national generic public id). */
  generic_ids: string[]
  regimes: RegionFiscalEntry[]
  invoice_uses: RegionFiscalEntry[]
  /** Documents the buyer can upload; absent on older servers. */
  documents?: IdentityDocumentSpec[]
  /**
   * Person type -> pattern its tax ids follow (contract 1.9), so the SDK tells the type from DATA instead of a function
   * each store injects. Absent: not derived. See `personTypeFromPatterns` (`@asteby/storefront-react/fiscal`).
   */
  person_patterns?: Record<string, string>
  /** Name of the pack's optional check algorithm (a warning at most, never a block). */
  checksum?: string | null
  /** The invoice use the organization prefers by default; it wins over `suggested_for_regimes`. */
  default_invoice_use?: string | null
}

export type RegionPaymentMethod = {
  code: string
  label: string
  description?: string
  kind: string
  flow: string
  providers: string[]
  installments: { months: number[]; min_amount: Money | null } | null
  min_amount: Money | null
  max_amount: Money | null
  expires_hours?: number
  icon?: string
  /** Payment forms the invoice may report for this method, comma separated; the first is the default (e.g. `04,28`). */
  fiscal_payment_form?: string
}

/**
 * `GET /storefront/region/postal-code?zip=`: where a postal code is, in the region pack's own names (the same ones the
 * server validates the address state against). Shaped for `AddressFields.lookupPostalCode`.
 */
export type RegionPostalCode = {
  province: string
  city: string
  neighborhoods: string[]
  /** Every municipality the code covers, only when more than one (the form leaves the city editable and offers them). */
  cities?: string[]
}

/**
 * One candidate of `GET /storefront/address/suggest`. A SUGGESTION: only the postal-code catalog of the region pack is
 * authoritative for state, city and colonia, so a form uses `street` / `house_number` and treats the rest as hints.
 */
export type AddressSuggestion = {
  /** Opaque id of the candidate at its provider. */
  id?: string
  /** The address as shown in the list. */
  label: string
  street?: string
  house_number?: string
  neighborhood?: string
  city?: string
  province?: string
  zip?: string
  country?: string
  lat?: number
  lng?: number
  precision?: 'rooftop' | 'street' | 'neighborhood' | 'postal_centroid' | 'locality' | 'region' | 'country'
  /** Key of the provider addon (`geo_photon`, ...). */
  source?: string
}

/** `GET /storefront/address/suggest`. Never an error because the provider is missing or down. */
export type AddressSuggestions = {
  suggestions: AddressSuggestion[]
  /** `false`: the market has no suggestion provider; a form stops asking and stays manual. */
  available: boolean
  /** `true`: there is a provider but it did not answer this time (timeout, outage). */
  degraded?: boolean
}

/** `GET /storefront/region`: how the market formats, taxes, addresses and invoices. */
export type Region = {
  country_code: string
  name: string
  locale: { default: string; available: string[]; current: string }
  timezone?: string
  currency: Record<string, unknown>
  formats?: Record<string, unknown>
  tax: Record<string, unknown>
  address?: { postal_code?: { pattern: string; example?: string }; [key: string]: unknown }
  subdivisions?: Record<string, unknown>[]
  phone?: Record<string, unknown>
  fiscal_id?: RegionFiscalId
  payment_methods?: RegionPaymentMethod[]
}

/** Where the fiscal data came from. `manual`: typed by the buyer. */
export type FiscalDocumentSource = 'pdf_client' | 'pdf_server' | 'qr' | 'manual'

/** What is kept about the document the data was read from. Never the document itself. */
export type FiscalDocumentEvidence = {
  /** `IdentityDocumentSpec.kind`. */
  kind: string
  /** The authority's id of the document. */
  document_id?: string | null
  /** ISO date the authority issued it. */
  issued_on?: string | null
  /** SHA-256 of the file, lowercase hex. */
  sha256?: string | null
  /** Engine that read it, e.g. `rules@1`. */
  extractor?: string
  source: FiscalDocumentSource
  /** The QR agreed with the text: `true`/`false`, `null` when there was no QR to compare. */
  qr_match?: boolean | null
}

export type FiscalVerification = {
  /** `reviewed` (the buyer confirmed it), `verified`, `mismatch`, `unverified`, `stale`. */
  status: 'reviewed' | 'verified' | 'mismatch' | 'unverified' | 'stale' | (string & {})
  checked_at?: string | null
}

/** Fiscal data as stored for a buyer. */
export type FiscalIdentity = {
  country_code: string
  tax_id: string
  legal_name: string
  tax_regime: string
  postal_code: string
  invoice_use?: string | null
  document?: FiscalDocumentEvidence | null
  verification?: FiscalVerification | null
}

export type FiscalIdentityInput = Omit<FiscalIdentity, 'verification' | 'country_code'> & { country_code?: string }

/**
 * A saved fiscal profile of the buyer (contract 1.9; up to `capabilities.fiscal_profiles.max`, one is the default).
 * Personal data: show the tax id masked in lists (`maskTaxId`), never log it.
 */
export type FiscalProfile = FiscalIdentity & {
  id: string
  /** Name the buyer gave it ("Personal", "My company"). */
  label: string
  /** Derived by the server from the region's data; `null` when the region defines none. */
  person_type?: string | null
  is_default: boolean
  last_used_at?: string | null
  created_at: string
  updated_at: string
}

/** Create or edit a profile. The server derives `person_type` and sets `verification`; the client cannot. */
export type FiscalProfileInput = Partial<FiscalIdentityInput> & { label?: string; is_default?: boolean }

// --- Buyer subjects: «My items» (contract 1.9) ------------------------------------------------------------------

/**
 * A subject is something the buyer shops for: a vehicle, a printer, a phone, a pet, a size. WHICH kinds exist is
 * data the organization publishes (`content.subjectKinds()`); nothing in the SDK or the contract names one. A store
 * with no kinds has no such section.
 */
export type SubjectFieldType = 'text' | 'year' | 'select'

export type SubjectField = {
  key: string
  label: string
  type: SubjectFieldType
  /** `catalog`: the value is an option of the kind's catalog (a `year` is checked against the options' years). Default `free`. */
  source?: 'catalog' | 'free'
  /** The field whose choice narrows this one (the cascade order). */
  depends_on?: string | null
  required?: boolean
  /**
   * Stored for the buyer and NEVER part of the label, the compatibility key, a filter, a cache key, a cookie or an
   * order (a licence plate). The server returns it only masked (`••34`): never prefill it, never log it.
   */
  private?: boolean
  max?: number
}

/**
 * One option of a catalog level (make, model, engine…). `from`/`to`/`ranges` bound the model years it covers: a
 * `year` field must satisfy every option on the chosen path that declares them.
 */
export type SubjectCatalogNode = {
  label: string
  from?: number
  to?: number
  ranges?: [number, number][]
  children?: Record<string, SubjectCatalogNode>
}

/** The cascade of options of a kind: levels follow the kind's `catalog` fields that are not years. */
export type SubjectCatalog = {
  version?: string | null
  tree: Record<string, SubjectCatalogNode>
}

export type SubjectKind = {
  key: string
  /** Singular («Vehicle»). */
  label: string
  /** The section's name («My garage»). */
  label_plural: string
  max_per_account: number
  fields: SubjectField[]
  /** Template of the compatibility key with the fields in braces (public ones only). */
  fit_key_template: string
  /** The checkout may ask «which one is this order for?». */
  attach_to_order?: boolean
  /** `null` for kinds with free fields only. */
  catalog?: SubjectCatalog | null
}

/** A saved item. `attributes` holds the public values; private ones come masked (`••34`). */
export type Subject = {
  id: string
  kind: string
  /** Public label built by the server from the catalog and the public values. */
  label: string
  nickname?: string | null
  /** Compatibility key (the `fit:<key>` tag of the products); `''` when the item does not resolve completely. */
  fit_key: string
  attributes: Record<string, unknown>
  /** The active item of its kind. */
  is_default: boolean
  last_used_at?: string | null
  created_at: string
}

export type SubjectInput = {
  kind: string
  attributes: Record<string, unknown>
  nickname?: string | null
  is_default?: boolean
}

/** Merged over the stored item: `null` clears a field; a private value sent back as its mask is kept. */
export type SubjectPatch = {
  attributes?: Record<string, unknown>
  nickname?: string | null
  is_default?: boolean
}

/** The item an order is for (kinds with `attach_to_order`). */
export type SubjectRef = { kind: string; id: string }

/** `PATCH /customer`. `fiscal: null` deletes the saved fiscal data (ARCO). */
export type CustomerUpdateInput = {
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  fiscal?: FiscalIdentityInput | null
  /** One of the store's languages (`400` with `field: 'locale'` otherwise); `null` clears it. */
  locale?: string | null
  /** Merged by event and channel; `null` restores the defaults. `400` for an event that cannot be turned off. */
  preferences?: CustomerPreferences | null
}

/** Post-processing: the value must match `pattern`; `group` of it replaces the value. */
export type IdentityCapture = { pattern: string; flags?: string; group?: number }

/**
 * One way to find a field. Only the members of its `strategy` apply:
 * `regex` (`pattern`, `flags`, `group`), `labeled_lines` (`label`), `concat_labeled` (`labels`, `separator`),
 * `catalog_phrases` (`catalog`, `start`, `end`), `date` (`pattern` with three groups, `flags`, `order`, `months`),
 * `qr_param` (`param`, `split`, `parts`, `match`). Any strategy takes `upper` and `capture`.
 */
export type IdentityStrategy = {
  strategy: 'regex' | 'labeled_lines' | 'concat_labeled' | 'catalog_phrases' | 'date' | 'qr_param'
  pattern?: string
  /** `i`, `s`, `m`. */
  flags?: string
  group?: number
  label?: string
  labels?: string[]
  separator?: string
  catalog?: string
  start?: string
  end?: string
  /** Permutation of `d`, `m`, `y`: the meaning of the three groups. */
  order?: string
  /** 12 month names, to read a month written in text. */
  months?: string[]
  /** `qr_param` fallback for a QR read by a keyboard scanner that garbled the punctuation: a pattern over the raw text whose group `group` is the value. Runs when `param` finds nothing. */
  scan?: string
  param?: string
  split?: string
  parts?: number
  match?: string
  upper?: boolean
  capture?: IdentityCapture
}

export type IdentityFieldRule = {
  /** Output name: `tax_id`, `legal_name`, `postal_code`, `tax_regime`, `document_id`, `issued_on`... */
  key: string
  /** Listed in `missing` when not found. */
  required?: boolean
  /** A list (e.g. every regime the document names). */
  multiple?: boolean
  /** Tried in order; the first non-empty value wins. `qr_param` ones only fill what the text lacks. */
  strategies: IdentityStrategy[]
}

/**
 * `rules@1`, as the region publishes it (same semantics as the reference interpreter of the region packs). Text
 * is normalized (`nbsp`, `collapse_ws`), then each field is resolved. Patterns are in the subset common to Go
 * (RE2) and JavaScript: no lookaround, backreferences, named groups, inline flags or `\p`.
 */
export type IdentityRulesV1 = {
  version: 1
  normalize?: ('nbsp' | 'collapse_ws')[]
  /** Captions of the document (regex fragments, case-insensitive, followed by a colon). A labelled value ends at the next caption. */
  labels?: string[]
  /** Template of the canonical QR URL, rebuilt from the fields the QR carried (`{field}` placeholders). It survives readers that garble the URL. */
  qr_canonical?: string
  fields: IdentityFieldRule[]
}

// ---------------------------------------------------------------------------
// Account lists (contract 1.19): orders, invoices, shipments, cursor-paged
// ---------------------------------------------------------------------------

/** The order a listed invoice or shipment belongs to. */
export type OrderRef = { id: string; number: string; created_at: string }

/** One order with its invoices and credit notes (the same `InvoiceDoc` as the order detail, nothing else). */
export type InvoiceListNode = { order: OrderRef; invoices: InvoiceDoc[] }

/** One delivered order with the service the buyer chose and its parcels (no tracking events, no map: those are in the detail). */
export type ShipmentListNode = { order: OrderRef; stage: string; service: OrderShippingService | null; shipments: Shipment[] }

export type InvoiceConnection = Connection<InvoiceListNode>
export type ShipmentConnection = Connection<ShipmentListNode>
