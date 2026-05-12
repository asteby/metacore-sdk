# @asteby/metacore-billing

Shared billing surface for Metacore host apps (ops, link, …). Wraps the
Go-side billing service (`github.com/asteby/metacore-sdk/billing`) with
typed React hooks and the `BillingSettings` component used on the
settings/billing route.

## Why

Before extraction, ops and link each maintained a near-identical copy of
the billing UI, lib client, and TypeScript types — three sources of truth
for one feature. This package is the canonical version. Host-specific
branding (plan icons, gradients, pricing copy) is fed in via props so the
SDK stays brand-neutral.

## Install

```bash
pnpm add @asteby/metacore-billing
```

## Quickstart

```tsx
import {
  createBillingClient,
  BillingSettings,
  type PlanDisplay,
} from '@asteby/metacore-billing'
import { Rocket, Zap, Building2 } from 'lucide-react'

const client = createBillingClient({
  fetcher: {
    get: (path) => api.get(path).then((r) => r.data),
    post: (path, body) => api.post(path, body).then((r) => r.data),
  },
})

const plans: PlanDisplay[] = [
  { slug: 'starter', name: 'Starter', icon: Zap, /* ... */ },
  { slug: 'pro', name: 'Pro', icon: Rocket, popular: true, /* ... */ },
  { slug: 'enterprise', name: 'Enterprise', icon: Building2, /* ... */ },
]

export function Billing() {
  return <BillingSettings client={client} plans={plans} />
}
```

## Self-hosted

The Go service stores Stripe keys in the DB-backed `platform_configs`
table. Admins rotate keys from the platform settings UI without
redeploying; the client surfaces a clear error when the backend reports
`503 billing_not_configured`.

## Backend

```go
import (
    "github.com/asteby/metacore-sdk/billing"
    bhandlers "github.com/asteby/metacore-sdk/billing/handlers"
    "github.com/asteby/metacore-sdk/billing/models"
)

svc := billing.New(db,
    billing.WithPlatformDefaults(models.PlatformConfigDefaults{
        PlatformName: "Your App",
        SupportEmail: "support@example.com",
    }),
)
h := bhandlers.New(db, svc, bhandlers.Config{AppBaseURL: "https://app.example.com"})

api.Get("/billing/subscription",   authMW, h.Subscription)
api.Post("/billing/checkout-session", authMW, h.Checkout)
api.Post("/billing/portal-session",   authMW, h.Portal)
app.Post("/webhooks/stripe", h.Webhook)
```

See the Go package docs for the full contract.
