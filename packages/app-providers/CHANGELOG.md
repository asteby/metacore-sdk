# @asteby/metacore-app-providers

## 0.3.0

### Minor Changes

- c9e78a0: `metacore-app-providers`: add `PlatformConfigProvider` + `usePlatformConfig` so any app can drive its branding (name, logo, primary/accent color) from a tenant-scoped backend endpoint without copying the provider into the app. The provider is transport-agnostic — callers pass a `fetcher` (axios, fetch, ofetch — anything async) and a `defaults` baseline. Branding is cached in `localStorage`, applied as CSS variables on `<html>` (including the OKLab → oklch conversion for primary/accent), and re-applied on dark/light toggles. New peer dep: `@tanstack/react-query`.

  `metacore-auth`: add three drop-in showcase components for the right-hand slot of `<SignInPage />` / `<SignUpPage />`, importable via deep paths so apps only bundle what they use:
  - `@asteby/metacore-auth/showcases/whatsapp` — `<WhatsAppShowcase />`, the iPhone chat mockup (extracted from the Link landing/auth flow).
  - `@asteby/metacore-auth/showcases/marketplace` — `<MarketplaceShowcase />`, a developer-marketplace hero with rotating addon tiles (for hub-style apps).
  - `@asteby/metacore-auth/showcases/generic` — `<GenericShowcase />`, a brand-neutral fallback for fast-spun-up apps that don't have a custom one yet.

  `framer-motion` is now a peer dep (optional) since the showcases animate in.

## 0.2.0

### Minor Changes

- afd1a4f: Nuevo paquete `@asteby/metacore-app-providers` — providers genéricos extraídos de host applications.

  Incluye: `DirectionProvider` (LTR/RTL + Radix), `FontProvider` (font class en html, fonts list injectable), `LayoutProvider` (sidebar variant/collapsible), `SearchProvider` (command palette hotkey). Utilidades `getCookie`/`setCookie`/`removeCookie` exportadas para consumidores.

  Todos los providers persisten en cookies. Reemplaza las copias locales duplicadas en host application frontends.
