# @asteby/metacore-pwa

## 0.5.0

### Minor Changes

- ebc1961: PWAProvider now auto-subscribes to Web Push once notification permission is granted (new `autoSubscribeOnGranted` prop, default `true`).

  Previously, having notification permission was not enough: nothing created the `PushSubscription`, so the server had nothing to send to and background/mobile push silently never arrived (apps had to wire `subscribeToPush()` themselves, which was easy to miss). The provider now subscribes on mount when permission is already granted, and watches for a later grant, so every consumer gets working push by default. Set `autoSubscribeOnGranted={false}` to manage subscription manually.

## 0.4.1

### Patch Changes

- f5cebe4: Fix PWA "Actualizar" button doing nothing in autoUpdate SW setups.

  When the SW uses `skipWaiting + clientsClaim` (autoUpdate), there is no waiting
  worker at the moment the user clicks "Actualizar" — the new build is already
  active. `updateServiceWorker(true)` posts SKIP_WAITING to a non-existent waiting
  worker and returns without effect.

  `updateApp` now schedules a `window.location.reload()` 400 ms after calling
  `updateServiceWorker(true)`. This covers both strategies:
  - **autoUpdate**: SW already active → reload immediately picks up the new build.
  - **prompt**: SKIP_WAITING fires controllerchange → existing reload handler runs
    first; the setTimeout is a harmless no-op in that case.

## 0.4.0

### Minor Changes

- 5f864d9: PWAProvider: detect new service-worker builds even when `virtual:pwa-register/react`
  is aliased to a no-op stub (e.g. module-federation hosts). An independent effect
  polls the live `navigator.serviceWorker.ready` registration on an interval AND on
  every tab focus/visibility regain, so a new deploy is picked up automatically (the
  SW self-activates → `controllerchange` → reload) instead of the user being stuck on
  the stale build until a manual hard reload / cache clear.

## 0.3.1

### Patch Changes

- 7e0a497: Drop the `metacorePWA` Vite-plugin re-export from the package root.

  Re-exporting `./vite-plugin` from the main entry pulled `vite-plugin-pwa` (Node-only — uses `module.createRequire`) into every consumer's browser bundle. Apps that imported `@asteby/metacore-pwa` for `<PWAProvider>` or `<PWAUpdatePrompt>` crashed at runtime with `(0 , import_browser_external_module.createRequire) is not a function`.

  The plugin already lives at `@asteby/metacore-pwa/vite-plugin`. Apps that wire it in `vite.config.ts` should import the sub-export directly:

  ```ts
  import { metacorePWA } from "@asteby/metacore-pwa/vite-plugin";
  ```

- d29daaf: Treat a 404 on `/push/public-key` as a no-op instead of an error.

  Push notifications are opt-in on the kernel — gated by `EnablePush` (which itself requires VAPID keys). Apps that boot without VAPID got a noisy `Failed to initialize push service: AxiosError 404` console error on every page load. The init handler now swallows 404s silently (the deployment intentionally has no push) and surfaces every other error class so misconfigured keys still show up.

## 0.3.0

### Minor Changes

- e23eede: Publicación inicial a npm del ecosistema metacore.

  Propaga los 13 paquetes del SDK al registry público para que las host applications consumidoras migren de `file:` a semver y Renovate pueda propagar updates.

## 0.2.0

### Minor Changes

- 6d243b0: Initial release of the metacore frontend ecosystem.

  11 packages extracted from host application frontends into a publishable monorepo with auto-propagation via Changesets + Renovate.
