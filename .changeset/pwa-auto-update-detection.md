---
'@asteby/metacore-pwa': minor
---

PWAProvider: detect new service-worker builds even when `virtual:pwa-register/react`
is aliased to a no-op stub (e.g. module-federation hosts). An independent effect
polls the live `navigator.serviceWorker.ready` registration on an interval AND on
every tab focus/visibility regain, so a new deploy is picked up automatically (the
SW self-activates → `controllerchange` → reload) instead of the user being stuck on
the stale build until a manual hard reload / cache clear.
