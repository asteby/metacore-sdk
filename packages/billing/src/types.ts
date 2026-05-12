/**
 * Wire types for the billing service. Mirrors the Go structs in
 * `github.com/asteby/metacore-sdk/billing/models` and the handler
 * response envelope. Hosts may extend these types via TS interface
 * declaration merging if they add custom fields.
 */

/** Stripe-derived subscription state. */
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'

/** Recurring interval of the active price. */
export type BillingInterval = 'monthly' | 'yearly'

/** Plan limits, mirrored from the Go Plan model. -1 means unlimited. */
export interface PlanLimits {
  max_agents: number
  max_contacts: number
  max_messages_month: number
  max_devices: number
  max_users: number
}

/**
 * SubscriptionState is the shape returned by GET /billing/subscription. The
 * `is_active` and `days_remaining` fields are derived server-side so the UI
 * doesn't need to reason about timezones.
 */
export interface SubscriptionState {
  id: string
  plan_slug: string
  plan_name: string
  status: SubscriptionStatus
  interval: BillingInterval
  current_period_start: string
  current_period_end: string
  trial_start?: string | null
  trial_end?: string | null
  is_active: boolean
  days_remaining: number
  gateway: string
  gateway_subscription_id: string
  limits: PlanLimits
}

/**
 * Plan display shape consumed by the BillingSettings component. Hosts
 * supply a list of plans (typically merged from i18n + icons + pricing
 * copy) so the SDK doesn't pin product/branding decisions.
 */
export interface PlanDisplay {
  slug: string
  name: string
  description: string
  /**
   * Optional icon component for the plan badge. Can be a lucide-react
   * icon, a custom SVG component, or omitted entirely (the SDK falls
   * back to a generic placeholder).
   */
  icon?: React.ComponentType<{ className?: string }>
  /** Optional CSS classes for the plan's badge background. */
  bgGradient?: string
  /** Per-interval display price (in dollars/euros — not cents). */
  price: { monthly: number; yearly: number }
  /** Human-readable feature bullets. */
  features: string[]
  /** Highlight this card with the "most popular" badge. */
  popular?: boolean
}

/** Payload for POST /billing/checkout-session. */
export interface CheckoutInput {
  plan_slug: string
  interval: BillingInterval
  return_to?: string
}

/** Successful response from the checkout endpoint. */
export interface CheckoutOutput {
  url: string
  session_id: string
}

/** Payload for POST /billing/portal-session. */
export interface PortalInput {
  return_to?: string
}

/** Successful response from the portal endpoint. */
export interface PortalOutput {
  url: string
}

/**
 * Auth slice consumed by BillingSettings — only the bits we actually
 * read so hosts with bigger auth stores can pass `auth.user` directly.
 */
export interface BillingAuthUser {
  plan_slug?: string
  plan_name?: string
  subscription_status?: SubscriptionStatus
  current_period_end?: string
}
