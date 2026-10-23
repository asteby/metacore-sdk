import type { DeliveryInput, DeliveryMethod, DeliveryOptions, UnavailableRateProvider } from './types.js'

/** Kind of a delivery radio: `ship` (address only, quote later), `rate` (a quoted rate) or `pickup` (a branch). */
export type DeliveryChoiceKind = 'ship' | 'rate' | 'pickup'

export type DeliveryChoice = {
  kind: DeliveryChoiceKind
  /** Everything after the first `:` — a rate id may contain more colons (`rate:skydropx:<id>`). */
  id: string
  method: DeliveryMethod
  /** `ship:` — only the address is saved; the rate is picked on the next pass. */
  addressOnly: boolean
}

/**
 * Parses the value of the single delivery radio group: `ship:`, `rate:<id>` or `pickup:<branch>`.
 * Splits on the FIRST colon only, so ids like `skydropx:<id>` survive intact (`split(':', 2)` would
 * silently drop everything after the second colon). Anything unknown is treated as `rate`.
 */
export function parseDelivery(value: string | null | undefined): DeliveryChoice {
  const raw = (value ?? '').trim()
  const i = raw.indexOf(':')
  const head = i === -1 ? raw : raw.slice(0, i)
  const id = i === -1 ? '' : raw.slice(i + 1)
  const kind: DeliveryChoiceKind = head === 'pickup' ? 'pickup' : head === 'ship' ? 'ship' : 'rate'
  return { kind, id, method: kind === 'pickup' ? 'pickup' : 'shipping', addressOnly: kind === 'ship' }
}

/** The `setDelivery` payload for a choice; `null` when it only saves the address (`ship:`). */
export function deliveryInput(choice: DeliveryChoice): DeliveryInput | null {
  if (choice.addressOnly) return null
  if (choice.kind === 'pickup') return { method: 'pickup', branch_id: choice.id }
  return { method: 'shipping', rate_id: choice.id || undefined }
}

/** Reason code a rate provider reports when the cart has items without weight. */
export const MISSING_WEIGHT = 'missing_weight'

export type DeliveryNotices = {
  /** Providers that could not quote because some item has no weight. */
  missingWeight: UnavailableRateProvider[]
  /** Providers that failed for any other reason (timeouts, errors). */
  unavailable: UnavailableRateProvider[]
  /** `true` when the shopper should be told something is off with the quote. */
  hasNotices: boolean
}

/** Splits `delivery.unavailable` into the `missing_weight` notice and the generic one. */
export function deliveryNotices(delivery: Pick<DeliveryOptions, 'unavailable' | 'partial'> | null | undefined): DeliveryNotices {
  const all = delivery?.unavailable ?? []
  const missingWeight = all.filter((u) => u.code === MISSING_WEIGHT)
  const unavailable = all.filter((u) => u.code !== MISSING_WEIGHT)
  return {
    missingWeight,
    unavailable,
    hasNotices: missingWeight.length > 0 || unavailable.length > 0 || delivery?.partial === true,
  }
}
