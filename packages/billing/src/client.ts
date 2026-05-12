/**
 * Transport-agnostic billing API client. Hosts supply a Fetcher and the
 * SDK calls the standard billing routes; we do not pin axios, ky, or any
 * specific JSON envelope library.
 *
 * Two response shapes are supported transparently:
 *
 *   - bare:      { id, plan_slug, ... }   ← legacy ops route
 *   - enveloped: { success, data: {...} } ← kernel-compliant routes
 *
 * The fetcher returns whichever shape the host's backend produces; this
 * module normalises by unwrapping `data` when present.
 */

import type {
  CheckoutInput,
  CheckoutOutput,
  PortalInput,
  PortalOutput,
  SubscriptionState,
} from './types'

/**
 * Minimal HTTP client surface — compatible with axios (after a tiny
 * wrapper), ky, or hand-rolled fetch helpers. The SDK only needs JSON in
 * / JSON out, so this contract is intentionally small.
 */
export interface BillingFetcher {
  get<T>(path: string): Promise<T>
  post<T>(path: string, body: unknown): Promise<T>
}

/** Construction options for the billing client. */
export interface BillingClientOptions {
  /** Path prefix applied to all routes. Defaults to "/billing". */
  basePath?: string
  /** HTTP client adapter — required. */
  fetcher: BillingFetcher
}

interface Enveloped<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

function unwrap<T>(raw: T | Enveloped<T>): T {
  // Heuristic: if the response carries an explicit `success` boolean we
  // treat it as the kernel envelope and unwrap `data`. Otherwise it's
  // the bare ops-legacy shape — return it untouched.
  if (raw && typeof raw === 'object' && 'success' in (raw as object)) {
    const env = raw as Enveloped<T>
    if (env.success === false) {
      throw new Error(env.message || env.error || 'billing request failed')
    }
    return (env.data ?? (raw as unknown)) as T
  }
  return raw as T
}

/** Concrete billing client built around a host-supplied fetcher. */
export class BillingClient {
  private readonly basePath: string
  private readonly http: BillingFetcher

  constructor(opts: BillingClientOptions) {
    this.basePath = opts.basePath ?? '/billing'
    this.http = opts.fetcher
  }

  /** GET /billing/subscription. */
  async getSubscription(): Promise<SubscriptionState> {
    const raw = await this.http.get<SubscriptionState | Enveloped<SubscriptionState>>(
      `${this.basePath}/subscription`,
    )
    return unwrap(raw)
  }

  /** POST /billing/checkout-session. */
  async createCheckoutSession(input: CheckoutInput): Promise<CheckoutOutput> {
    const raw = await this.http.post<CheckoutOutput | Enveloped<CheckoutOutput>>(
      `${this.basePath}/checkout-session`,
      input,
    )
    return unwrap(raw)
  }

  /** POST /billing/portal-session. */
  async createPortalSession(input: PortalInput = {}): Promise<PortalOutput> {
    const raw = await this.http.post<PortalOutput | Enveloped<PortalOutput>>(
      `${this.basePath}/portal-session`,
      input,
    )
    return unwrap(raw)
  }

  /**
   * Redirect to Stripe Checkout for the given plan. Caller-friendly
   * wrapper that surfaces a clear error when the server returns 503
   * (billing not configured).
   */
  async startCheckout(
    plan_slug: string,
    interval: 'monthly' | 'yearly' = 'monthly',
    return_to?: string,
  ): Promise<void> {
    try {
      const { url } = await this.createCheckoutSession({ plan_slug, interval, return_to })
      window.location.href = url
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: string } } }
      if (e?.response?.status === 503) {
        throw new Error(
          e.response.data?.error ||
            'Billing is not configured yet. Ask the platform admin to add Stripe keys in /platform/settings.',
        )
      }
      throw err
    }
  }

  /** Redirect to Stripe Customer Portal. */
  async openCustomerPortal(return_to?: string): Promise<void> {
    const { url } = await this.createPortalSession({ return_to })
    window.location.href = url
  }
}

/**
 * Convenience factory — most hosts only ever construct one client per
 * app instance and pass it down via React context or a hook config.
 */
export function createBillingClient(opts: BillingClientOptions): BillingClient {
  return new BillingClient(opts)
}
