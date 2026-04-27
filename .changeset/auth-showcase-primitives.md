---
"@asteby/metacore-auth": major
---

**BREAKING**: replace product-specific showcases (`/showcases/whatsapp`, `/showcases/marketplace`) with brand-agnostic, composable building blocks. The SDK no longer ships any auth showcase tied to a product narrative — those belong in each app's `features/auth/showcase/`.

### Removed

- `@asteby/metacore-auth/showcases/whatsapp` (the iPhone chat mockup with hardcoded restaurant/product/order conversations).
- `@asteby/metacore-auth/showcases/marketplace` (the addon-tile hero with developer-marketplace copy).
- The `WhatsAppShowcase`, `ChatMockup`, and `MarketplaceShowcase` exports from `@asteby/metacore-auth/showcases`.

### Added — `@asteby/metacore-auth/showcases/blocks`

Four composable, brand-neutral blocks suitable for auth showcases, dashboards, ERP module pickers, marketing surfaces, onboarding tours — anywhere a hero zone makes sense:

- **`<HeroPanel>`** — `title` + `subtitle` + optional `eyebrow` and `footer` slots. Drop-in for any "what is this" header.
- **`<TileGrid>`** — grid of `{ Icon, label, tag }` tiles with 2/3/4-column layout. Backs marketplace previews, ERP module pickers, integration galleries.
- **`<FeatureList>`** — vertical list of `{ Icon, title, description }` rows. "What's included" / onboarding-tour shape.
- **`<StatRow>`** — horizontal headline metrics ("1.2M+ messages", "99.9% uptime").

Each block accepts a `noAnimate` prop and animates with `framer-motion` by default.

### Migration

```diff
- import { WhatsAppShowcase } from '@asteby/metacore-auth/showcases/whatsapp'
+ // Define your app's chat showcase locally:
+ // app/src/features/auth/showcase/chat-showcase.tsx
+ // (compose <DeviceFrame> from your own UI + your own conversations)

- import { MarketplaceShowcase } from '@asteby/metacore-auth/showcases/marketplace'
+ import { HeroPanel, TileGrid } from '@asteby/metacore-auth/showcases/blocks'
+ // Compose them in your app's `features/auth/showcase/` with your own tile data.
```

`<GenericShowcase />` (`@asteby/metacore-auth/showcases/generic`) is unchanged — it's a brand-neutral fallback for fast-spun-up apps.
