import type { TrackingLookupInput, TrackingLookupResult, TrackingView } from '@asteby/storefront'

export type TrackingFormError = 'incomplete' | 'not_found' | 'rate_limited' | 'unavailable'

/** What a route action returns to `TrackOrderLookup`. */
export type TrackingActionData = { tracking?: TrackingView; error?: TrackingFormError; retryAfter?: number }

type FormLike = { get(name: string): unknown } | Record<string, unknown>

const field = (data: FormLike, name: string, max: number): string => {
  const v = typeof (data as { get?: unknown }).get === 'function' ? (data as { get(n: string): unknown }).get(name) : (data as Record<string, unknown>)[name]
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/**
 * The lookup the buyer asked for, from a `FormData` / `URLSearchParams` / plain object: order number + email when both
 * are there, else the guide, else `null` (the form was incomplete). Server-side validation is the API's; this only
 * bounds and shapes the input.
 */
export function parseTrackingForm(data: FormLike): TrackingLookupInput | null {
  const order = field(data, 'order_number', 64)
  const email = field(data, 'email', 254)
  if (order && /^[^@\s]+@[^@\s]+$/.test(email)) return { order_number: order, email }
  const guide = field(data, 'tracking_number', 64).replace(/\s+/g, '')
  return guide ? { tracking_number: guide } : null
}

/** Runs the lookup of a form post and folds it into the data `TrackOrderLookup` renders. Never throws. */
export async function resolveTrackingLookup(
  sf: { tracking: { lookup(input: TrackingLookupInput): Promise<TrackingLookupResult> } },
  data: FormLike,
): Promise<TrackingActionData> {
  const input = parseTrackingForm(data)
  if (!input) return { error: 'incomplete' }
  const res = await sf.tracking.lookup(input).catch((): TrackingLookupResult => ({ status: 'unavailable' }))
  if (res.status === 'found') return { tracking: res.tracking }
  if (res.status === 'rate_limited') return { error: 'rate_limited', ...(res.retryAfter ? { retryAfter: res.retryAfter } : {}) }
  return { error: res.status }
}
