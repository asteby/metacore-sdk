// Public surface of @asteby/metacore-billing. Subpath imports
// (./client, ./hooks, ./components) are also published — prefer them for
// tree-shaking when bundling.

export type {
  BillingAuthUser,
  BillingInterval,
  CheckoutInput,
  CheckoutOutput,
  PlanDisplay,
  PlanLimits,
  PortalInput,
  PortalOutput,
  SubscriptionState,
  SubscriptionStatus,
} from './types'

export { BillingClient, createBillingClient } from './client'
export type { BillingClientOptions, BillingFetcher } from './client'

export {
  billingKeys,
  useBilling,
  useCreateCheckoutSession,
  useCreatePortalSession,
  useRefreshSubscription,
} from './hooks'
export type { BillingHookOptions } from './hooks'

export { BillingSettings } from './components/BillingSettings'
export type { BillingSettingsLabels, BillingSettingsProps } from './components/BillingSettings'
