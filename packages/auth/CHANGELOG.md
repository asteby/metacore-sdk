# @asteby/metacore-auth

## 19.0.0

### Patch Changes

- Updated dependencies [9bd4d4e]
  - @asteby/metacore-ui@2.12.0

## 18.0.0

### Patch Changes

- Updated dependencies [ee5f7e8]
  - @asteby/metacore-ui@2.11.0

## 17.0.0

### Patch Changes

- Updated dependencies [0704d54]
  - @asteby/metacore-ui@2.10.0

## 16.0.0

### Patch Changes

- Updated dependencies [25a78e7]
  - @asteby/metacore-ui@2.9.0

## 15.0.0

### Patch Changes

- Updated dependencies [bd30e57]
  - @asteby/metacore-ui@2.8.0

## 14.0.0

### Patch Changes

- Updated dependencies [84aeaf2]
  - @asteby/metacore-ui@2.7.0

## 13.0.0

### Patch Changes

- Updated dependencies [3f41073]
  - @asteby/metacore-ui@2.6.0

## 12.0.0

### Patch Changes

- Updated dependencies [8439e9e]
  - @asteby/metacore-ui@2.5.0

## 11.0.0

### Patch Changes

- Updated dependencies [5f864d9]
  - @asteby/metacore-ui@2.4.0

## 10.0.0

### Patch Changes

- Updated dependencies [ab41d75]
  - @asteby/metacore-ui@2.3.0

## 9.0.0

### Patch Changes

- Updated dependencies [6299af7]
  - @asteby/metacore-ui@2.2.0

## 8.0.0

### Patch Changes

- Updated dependencies [3b40ed5]
  - @asteby/metacore-ui@2.1.0

## 7.1.0

### Minor Changes

- 43502ab: refactor(auth): single source of truth — store is canonical, `AuthProvider` retained as a thin wrapper

  `AuthProvider` no longer holds its own `useState`/Context with a different storage key (`saas_user`) than the canonical zustand store (`auth_user`). It is now a Fragment-returning wrapper that, on mount, optionally seeds `useAuthStore` with `initialUser` / `initialAccessToken` for SSR/hydration use-cases. All reads and mutations live in the store.

  The legacy `useAuth()` hook is kept for back-compat but is now a read-through projection over `useAuthStore`. Calling `login(email, role)` and `logout()` now mutate the store directly, so consumers can mix-and-match `useAuth()` and `useAuthStore` without state divergence.

  Both `AuthProvider` and `useAuth` are marked `@deprecated`. New code should prefer `useAuthStore(state => state.auth.user)` (or the full `auth` slice). No public API was removed.

  Net effect: removes the dual-source-of-truth bug flagged by the Bridge API audit. The "two states could drift" failure mode is now structurally impossible.

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
