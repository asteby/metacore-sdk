# @asteby/metacore-pwa

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
