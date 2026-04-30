# @asteby/metacore-auth

## 7.0.0

### Patch Changes

- Updated dependencies [64de425]
  - @asteby/metacore-ui@2.0.0

## 6.0.0

### Patch Changes

- Updated dependencies [3450876]
  - @asteby/metacore-ui@0.7.0

## 5.0.0

### Major Changes

- ea200fb: **BREAKING**: replace product-specific showcases (`/showcases/whatsapp`, `/showcases/marketplace`) with brand-agnostic, composable building blocks. The SDK no longer ships any auth showcase tied to a product narrative — those belong in each app's `features/auth/showcase/`.

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

## 4.1.0

### Minor Changes

- c9e78a0: `metacore-app-providers`: add `PlatformConfigProvider` + `usePlatformConfig` so any app can drive its branding (name, logo, primary/accent color) from a tenant-scoped backend endpoint without copying the provider into the app. The provider is transport-agnostic — callers pass a `fetcher` (axios, fetch, ofetch — anything async) and a `defaults` baseline. Branding is cached in `localStorage`, applied as CSS variables on `<html>` (including the OKLab → oklch conversion for primary/accent), and re-applied on dark/light toggles. New peer dep: `@tanstack/react-query`.

  `metacore-auth`: add three drop-in showcase components for the right-hand slot of `<SignInPage />` / `<SignUpPage />`, importable via deep paths so apps only bundle what they use:
  - `@asteby/metacore-auth/showcases/whatsapp` — `<WhatsAppShowcase />`, the iPhone chat mockup (extracted from the Link landing/auth flow).
  - `@asteby/metacore-auth/showcases/marketplace` — `<MarketplaceShowcase />`, a developer-marketplace hero with rotating addon tiles (for hub-style apps).
  - `@asteby/metacore-auth/showcases/generic` — `<GenericShowcase />`, a brand-neutral fallback for fast-spun-up apps that don't have a custom one yet.

  `framer-motion` is now a peer dep (optional) since the showcases animate in.

## 4.0.0

### Patch Changes

- Updated dependencies [1c93e68]
  - @asteby/metacore-ui@0.6.0

## 3.0.0

### Patch Changes

- Updated dependencies [317b021]
  - @asteby/metacore-ui@0.5.0

## 2.0.0

### Minor Changes

- e23eede: Publicación inicial a npm del ecosistema metacore.

  Propaga los 13 paquetes del SDK al registry público para que las host applications consumidoras migren de `file:` a semver y Renovate pueda propagar updates.

### Patch Changes

- Updated dependencies [e23eede]
  - @asteby/metacore-ui@0.3.0

## 1.0.0

### Minor Changes

- 6d243b0: Initial release of the metacore frontend ecosystem.

  11 packages extracted from host application frontends into a publishable monorepo with auto-propagation via Changesets + Renovate.

### Patch Changes

- Updated dependencies
- Updated dependencies [6d243b0]
  - @asteby/metacore-ui@0.2.0
