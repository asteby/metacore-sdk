# @asteby/metacore-app-providers

## 2.0.0

### Major Changes

- 0e8db78: Promote three critical SDK packages to **1.0.0**. This is a stability promotion — the public surface of each package has been exercised by every metacore app in production (`link`, `ops`, `hub/landing`, `hub/frontend`, `fullstack-starter`) and is now committed under semver.

  No breaking API changes ship in this bump.
  - `@asteby/metacore-theme` (0.3 → 1.0): tokens, CSS-variable contract (`--primary`, `--background`, `--sidebar-*`, …), `themeConfig` shape, `ThemeProvider` / `useTheme`, and the `./preset` / `./fonts` / `./tokens.css` / `./index.css` subpaths are all stable. Internal `oklch` values may still re-tune in minor releases.
  - `@asteby/metacore-starter-config` (0.3 → 1.0): the four shared subpaths (`./tailwind`, `./tsconfig`, `./vite`, `./eslint`) plus `./fonts` are stable. `defineMetacoreConfig()` options stay additive within the major.
  - `@asteby/metacore-app-providers` (0.6.5 → 1.0): all providers (`DirectionProvider`, `FontProvider`, `LayoutProvider`, `SearchProvider`, `PlatformConfigProvider`), the `MetacoreAppShell` full kit, `applyBranding` / `applyCachedBranding` helpers, and persistence keys (`dir`, `font`, `layout_variant`, `layout_collapsible`, `platform-branding`) are locked. Optional peers (`@asteby/metacore-pwa`, `@asteby/metacore-runtime-react`, `@asteby/metacore-ui`, `sonner`) keep their independent cadence via the declared peer ranges.

### Patch Changes

- Updated dependencies [64de425]
  - @asteby/metacore-ui@2.0.0
  - @asteby/metacore-runtime-react@8.0.0

## 0.6.5

### Patch Changes

- 1d3c3c0: `MetacoreInstallRequest` now carries `name` + `category` from the Hub. The install listener forwards them to the backend so the host can persist a display name and render "Activos Fijos" in the sidebar instead of the raw `addon_key`.

  Pairs with `metacore-kernel/marketplace` adding the same columns and `asteby-hq/hub` forwarding the localised values from the iframe.

## 0.6.4

### Patch Changes

- c4d3b73: Dispatch `metacore:metadata-changed` window event after a successful addon install.

  Hosts that wire their sidebar / dashboard against `/metadata/all` and `/marketplace/installs` listen for this event to refetch without a page reload, so the freshly-installed addon shows up in the nav within the same session. The event detail carries `{reason: 'addon-installed', addonKey}` for finer-grained handling.

## 0.6.3

### Patch Changes

- e9773e9: Drop the metadata cache after a successful addon install so the next read of `/metadata/all` (sidebar, dashboard) picks up whatever models the new addon registered. Best-effort — silently no-ops if `useMetadataCache` shape changes.

## 0.6.2

### Patch Changes

- 1c7c31a: Trim redundant addon-key from install toasts.

  `Instalando ${addonKey}…` repeated information the user already saw on the iframe button. The host now shows generic `Instalando…` / `Addon instalado` / `Falló la instalación` (with the error message in the toast description on failure).

## 0.6.1

### Patch Changes

- 27b043c: `MetacoreAppShell`'s addon-install listener now surfaces a loading / success / failure toast in the host's toaster while the install runs, matching the feedback users get on every other long action (export, import, delete). Previously the iframe button flipped state silently in the host's perspective.

## 0.6.0

### Minor Changes

- f5960c6: `MetacoreAppShell` now listens for the `metacore:install` postMessage that the embedded Hub iframe emits when a user clicks "Instalar" on an addon page.

  Default behaviour: POSTs `{ addonKey, version, bundleURL }` to the host API at `/marketplace/install` and replies to the iframe with `metacore:installed` on success (or `metacore:install-failed` with the error). Apps can override with the new `onAddonInstall` prop:

  ```tsx
  <MetacoreAppShell
    api={api}
    queryClient={qc}
    onAddonInstall={async (req, source) => {
      await myCustomInstaller(req)
      source?.postMessage({ type: 'metacore:installed', addonKey: req.addonKey }, '*')
    }}
  >
  ```

  Pass `onAddonInstall={null}` to disable the listener entirely.

  Pairs with `asteby-hq/hub#66` which switches the embedded install widget from "copy this command" to a one-click button.

## 0.5.0

### Minor Changes

- 922d63b: Add `<MetacoreAppShell>` — single-line provider wiring for metacore apps.

  Today every app reproduces the same eight-deep wedding cake of providers (QueryClient + ApiProvider + PWAProvider + Toaster + install/update/offline prompts + metadata cache invalidation). The new shell collapses it into:

  ```tsx
  import { MetacoreAppShell } from "@asteby/metacore-app-providers";

  <MetacoreAppShell api={api} queryClient={queryClient}>
    <RouterProvider router={router} />
  </MetacoreAppShell>;
  ```

  What it bundles:
  - `QueryClientProvider` (when `queryClient` is supplied)
  - `ApiProvider` from `runtime-react`
  - `PWAProvider` + `PWAInstallPrompt` + `PWAUpdatePrompt` + `OfflineIndicator`
  - `Toaster` from `metacore-ui`
  - A `MetadataInvalidator` that clears `useMetadataCache` the moment the PWA layer reports a new service worker — so the next mount of `<DynamicTable>` fetches fresh column / filter / actions definitions instead of replaying yesterday's metadata. Resolves the stale-cache bug where adding `filterable: true` to a column on the backend was invisible until users cleared localStorage.

  Apps that want a subset can pass `hidePWAInstall` / `hidePWAUpdate` / `hideOfflineIndicator` / `hideToaster` / `disableMetadataInvalidate` to opt out per layer.

  `runtime-react` patch: also switches `<DynamicTable>` to stale-while-revalidate metadata fetch (paint with cache, always re-fetch in background) so the shell isn't the only path that picks up backend changes.

### Patch Changes

- Updated dependencies [922d63b]
- Updated dependencies [922d63b]
- Updated dependencies [7e0a497]
- Updated dependencies [d29daaf]
  - @asteby/metacore-runtime-react@7.1.5
  - @asteby/metacore-pwa@0.3.1

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
