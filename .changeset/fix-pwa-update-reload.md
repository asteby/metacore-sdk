---
"@asteby/metacore-pwa": patch
---

Fix PWA "Actualizar" button doing nothing in autoUpdate SW setups.

When the SW uses `skipWaiting + clientsClaim` (autoUpdate), there is no waiting
worker at the moment the user clicks "Actualizar" — the new build is already
active. `updateServiceWorker(true)` posts SKIP_WAITING to a non-existent waiting
worker and returns without effect.

`updateApp` now schedules a `window.location.reload()` 400 ms after calling
`updateServiceWorker(true)`. This covers both strategies:
- **autoUpdate**: SW already active → reload immediately picks up the new build.
- **prompt**: SKIP_WAITING fires controllerchange → existing reload handler runs
  first; the setTimeout is a harmless no-op in that case.
