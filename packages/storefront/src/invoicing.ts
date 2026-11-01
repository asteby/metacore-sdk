/**
 * The ONE answer to «does this store talk about invoices?». The organization turns invoicing off with a single
 * setting on the server (contract 1.29); the server then publishes `capabilities.invoicing.unavailable_reason:
 * 'disabled'`. A store reads it here and hides every invoice surface (menu, pages, order actions, tax-data fields,
 * FAQ / footer copy); it never checks a store name or a market.
 *
 * Only an explicit `disabled` counts. `no_provider`, `not_configured`, `no_issuer`, an absent `invoicing` (older
 * server, or one that could not answer) and `available: true` all mean «not switched off»: the store keeps today's
 * behaviour, so an install that never touched the setting changes nothing.
 */
import type { CustomerCapabilities, InvoicingCapabilities } from './types.js'

type CapsLike = Pick<CustomerCapabilities, 'invoicing'> | { invoicing?: Pick<InvoicingCapabilities, 'available' | 'unavailable_reason'> | null } | null | undefined

/** True when the organization switched invoicing off on purpose. */
export function invoicingDisabled(caps: CapsLike): boolean {
  const inv = caps?.invoicing
  return !!inv && inv.available === false && inv.unavailable_reason === 'disabled'
}

/** `!invoicingDisabled(caps)`: false hides every invoice surface. Unknown (no capabilities) is true. */
export function invoicingEnabled(caps: CapsLike): boolean {
  return !invoicingDisabled(caps)
}
