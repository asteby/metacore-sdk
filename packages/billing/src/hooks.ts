/**
 * React Query hooks around the billing client. Hosts pass a single
 * BillingClient instance via the hook config so the SDK doesn't reach
 * for global state — every consumer is explicit about which backend it
 * speaks to (useful for storybook, multi-tenant admin tools, …).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CheckoutInput,
  CheckoutOutput,
  PortalInput,
  PortalOutput,
  SubscriptionState,
} from './types'
import type { BillingClient } from './client'

/** Cache key for the subscription query. */
export const billingKeys = {
  subscription: () => ['billing', 'subscription'] as const,
}

/** Hook config — every hook takes a client so dependency injection is explicit. */
export interface BillingHookOptions {
  client: BillingClient
  /** Optional refetch interval in ms. */
  refetchInterval?: number
}

/**
 * useBilling fetches the caller's current subscription state. Stale data
 * is kept for 30 seconds because subscription transitions are infrequent
 * — Stripe webhooks invalidate the cache when they arrive.
 */
export function useBilling({ client, refetchInterval }: BillingHookOptions) {
  return useQuery<SubscriptionState>({
    queryKey: billingKeys.subscription(),
    queryFn: () => client.getSubscription(),
    staleTime: 30_000,
    refetchInterval,
  })
}

/**
 * useCreateCheckoutSession returns a mutation that hits the
 * checkout-session endpoint. The host is responsible for redirecting to
 * the returned URL; the client also exposes `startCheckout` which does
 * it automatically.
 */
export function useCreateCheckoutSession({ client }: BillingHookOptions) {
  return useMutation<CheckoutOutput, Error, CheckoutInput>({
    mutationFn: (input) => client.createCheckoutSession(input),
  })
}

/**
 * useCreatePortalSession returns a mutation around the portal-session
 * endpoint.
 */
export function useCreatePortalSession({ client }: BillingHookOptions) {
  return useMutation<PortalOutput, Error, PortalInput>({
    mutationFn: (input) => client.createPortalSession(input),
  })
}

/**
 * useRefreshSubscription returns a no-arg callback that invalidates the
 * subscription cache. Useful after returning from Stripe Checkout to
 * pick up the new plan once the webhook has reconciled.
 */
export function useRefreshSubscription() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: billingKeys.subscription() })
}
