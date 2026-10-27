/**
 * Server side of the live delivery quote (`@asteby/storefront-react/checkout/server`). One JSON resource route that the
 * browser calls (see `useLiveDelivery({ quoteUrl })`) each time the destination changes: it saves the destination in the
 * cart (`PUT /carts/:id/shipping-address`) and answers the delivery options (`GET /carts/:id/delivery-options`) as OPS
 * sends them. No React, no router: Web `Request`/`Response` only. Amounts, carriers and free-shipping rules are OPS's.
 *
 *   // app/routes/checkout-quote.ts
 *   const handler = createQuoteHandler({ storefront: (req) => storefront(req), readCartId })
 *   export const action = ({ request }) => handler(request)
 */
import { isStorefrontError, type DeliveryOptions, type ShippingRate, type StorefrontClient } from '@asteby/storefront'

export type QuoteBody = Record<string, string>

const FIELDS = ['country_code', 'zip', 'province', 'city', 'neighborhood', 'address1', 'first_name', 'last_name', 'phone'] as const

/** The fields of the request: only what the cart's address knows, trimmed and bounded. */
export function readQuoteBody(raw: unknown): QuoteBody {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out: QuoteBody = {}
  for (const k of FIELDS) {
    const v = src[k]
    out[k] = typeof v === 'string' ? v.trim().slice(0, 200) : ''
  }
  return out
}

/** The minimum to quote: a 5-digit postal code, state and city (the region catalog already resolved them). Override with `isQuotable`. */
export function quotable(b: QuoteBody): boolean {
  return /^\d{5}$/.test(b.zip ?? '') && Boolean(b.province) && Boolean(b.city)
}

/** Placeholder for the street while the buyer has not typed it (OPS requires one to save an address). The full address is saved again at checkout. */
export const PENDING_STREET = 'Por confirmar'

export type QuoteOptions = {
  /** Text saved as `address1` while the street is empty. Default {@link PENDING_STREET}. */
  pendingStreet?: string
  /** Narrows the rates the buyer sees (e.g. only the shop's own flat rate). Default: all. */
  filterRates?: (rates: readonly ShippingRate[]) => ShippingRate[]
  /** Re-reads when a carrier did not answer in time (`unavailable` with no rate). Default 2. */
  retries?: number
}

export async function quoteDelivery(sf: StorefrontClient, cartId: string, b: QuoteBody, opts: QuoteOptions = {}): Promise<DeliveryOptions> {
  await sf.carts.setShippingAddress(cartId, {
    first_name: b.first_name ?? '',
    last_name: b.last_name ?? '',
    address1: b.address1 || opts.pendingStreet || PENDING_STREET,
    address2: null,
    neighborhood: b.neighborhood || null,
    reference: null,
    city: b.city ?? '',
    province: b.province ?? '',
    zip: b.zip ?? '',
    country_code: b.country_code || 'MX',
    phone: b.phone ?? '',
  })
  let delivery = await sf.carts.deliveryOptions(cartId)
  for (let i = 0; i < (opts.retries ?? 2) && delivery.rates.length === 0 && delivery.pickup.length === 0 && (delivery.unavailable?.length ?? 0) > 0; i++) {
    delivery = await sf.carts.deliveryOptions(cartId).catch(() => delivery)
  }
  return opts.filterRates ? { ...delivery, rates: opts.filterRates(delivery.rates) } : delivery
}

export type CreateQuoteHandlerOptions = QuoteOptions & {
  storefront: (request: Request) => Promise<StorefrontClient>
  /** The cart of this browser (the shop's cookie), `null` when none. */
  readCartId: (request: Request) => Promise<string | null | undefined>
  /** `Cache-Control` of every answer. Default `private, no-store`. */
  cacheControl?: string
  isQuotable?: (b: QuoteBody) => boolean
  onError?: (err: unknown) => void
}

/** POST handler: JSON in, `DeliveryOptions` out; errors are always JSON `{ error: { code, message } }`, never HTML. */
export function createQuoteHandler(cfg: CreateQuoteHandlerOptions): (request: Request) => Promise<Response> {
  const headers = { 'Cache-Control': cfg.cacheControl ?? 'private, no-store' }
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers })
  return async (request) => {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...headers, Allow: 'POST' } })
    const cartId = await cfg.readCartId(request)
    if (!cartId) return json({ error: { code: 'no_cart', message: 'No cart.' } }, 409)
    const body = readQuoteBody(await request.json().catch(() => null))
    if (!(cfg.isQuotable ?? quotable)(body)) return json({ error: { code: 'incomplete', message: 'Postal code, state and city are required.' } }, 422)
    try {
      const sf = await cfg.storefront(request)
      return json(await quoteDelivery(sf, cartId, body, cfg))
    } catch (err) {
      if (isStorefrontError(err) && err.status < 500) return json({ error: { code: err.code ?? 'rejected', message: String(err.message).slice(0, 200), field: err.field ?? null } }, err.status)
      cfg.onError?.(err)
      return json({ error: { code: 'unavailable', message: 'Could not quote the delivery.' } }, 503)
    }
  }
}
