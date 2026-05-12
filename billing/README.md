# billing — Go package

Subscription / Stripe billing service used across Metacore host apps.

## Design

* **Self-hosted friendly.** Stripe keys live in the DB-backed
  `platform_configs` table; superadmins rotate them from the platform
  settings admin UI without a redeploy. `Service.IsConfigured()`
  returns `false` cleanly when no key is set, and every mutating method
  returns `ErrNotConfigured` so the rest of the app keeps working.
* **Framework-agnostic core.** The `Service` is plain Go. A Fiber v3
  adapter lives in `billing/handlers`; the middleware package follows
  the same split (Guard + thin Fiber adapter).
* **Brand-neutral.** The platform name, support URL, branding colours,
  and currency defaults are injected via `billing.WithPlatformDefaults`.
  Hosts pass their own struct — the SDK never hardcodes a consumer
  brand.
* **Host-pluggable tenant model.** `OrganizationStore` is an interface;
  the default `NewGormOrganizationStore` assumes an `organizations`
  table with `id`, `name`, and `stripe_customer_id`. Hosts whose schema
  differs implement their own adapter.

## Quickstart

```go
import (
    "github.com/asteby/metacore-sdk/billing"
    bhandlers "github.com/asteby/metacore-sdk/billing/handlers"
    bmw "github.com/asteby/metacore-sdk/billing/middleware"
    "github.com/asteby/metacore-sdk/billing/models"
)

svc := billing.New(db,
    billing.WithPlatformDefaults(models.PlatformConfigDefaults{
        PlatformName: "Ops",
        SupportEmail: "support@asteby.com",
    }),
)

h := bhandlers.New(db, svc, bhandlers.Config{
    AppBaseURL:        "https://app.example.com",
    DefaultReturnPath: "/settings/billing",
})

api.Get("/billing/subscription",   authMW, h.Subscription)
api.Post("/billing/checkout-session", authMW, h.Checkout)
api.Post("/billing/portal-session",   authMW, h.Portal)
app.Post("/webhooks/stripe", h.Webhook) // public; auth = signature

// Guard premium routes:
guard := bmw.NewFiberMiddleware(bmw.NewGuard(db))
api.Post("/agents", authMW, guard.ActiveSubscriptionRequired, guard.RequirePlan("pro"), createAgent)
```

## Response envelope

Handler responses use the kernel `{success, data, meta}` envelope. The
TypeScript client (`@asteby/metacore-billing`) unwraps `data` so consumers
see the bare payload either way.

## Tests

```
GOWORK=off go test ./billing/...
```

## Related

* `packages/billing` — TS client, hooks, and the BillingSettings UI.
* `billing/models` — exported schema (Plan, Subscription, PlatformConfig,
  UsageMetric). Hosts who already keep these models can either re-export
  the SDK types or run their own migration; both are supported.
