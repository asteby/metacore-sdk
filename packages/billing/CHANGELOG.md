# @asteby/metacore-billing

## 3.0.0

### Patch Changes

- Updated dependencies [ab41d75]
  - @asteby/metacore-ui@2.3.0

## 2.0.0

### Patch Changes

- Updated dependencies [6299af7]
  - @asteby/metacore-ui@2.2.0

## 1.0.0

### Patch Changes

- Updated dependencies [3b40ed5]
  - @asteby/metacore-ui@2.1.0

## 0.2.0

### Minor Changes

- aab728d: Add `@asteby/metacore-billing` — canonical TS surface for the Metacore
  billing module. Pairs with the new `github.com/asteby/metacore-sdk/billing`
  Go package extracted from the duplicated ops/link host-side
  implementations.

  Exports:
  - `BillingClient` / `createBillingClient` — fetcher-agnostic API client
    that talks to `/billing/subscription`, `/billing/checkout-session`,
    `/billing/portal-session`. Unwraps both the kernel `{success, data}`
    envelope and the legacy bare-payload shape.
  - `useBilling`, `useCreateCheckoutSession`, `useCreatePortalSession`,
    `useRefreshSubscription` — React Query hooks driven by an explicit
    `BillingClient`.
  - `BillingSettings` — drop-in settings/billing page. Branding (icons,
    gradients, pricing copy) is injected via the `plans` prop so each
    host renders its own product narrative.

  Self-hosted safe: the server reports `503 billing_not_configured` when
  no Stripe keys are loaded, and the client surfaces that as a typed
  error so admins know to add keys via `/platform/settings`.
