---
'@asteby/metacore-runtime-react': patch
---

Fix intermittent `#RUNTIME-009` ("Please call createInstance first") addon load
errors.

When an addon mounts before `@module-federation/vite`'s asynchronous runtime
init lands at host boot, `registerRemotes`/`loadRemote` throw RUNTIME-009. The
runtime is on its way — it's a boot race — so `AddonLoader` now treats that
specific error as transient and retries with a short backoff (~10 × 60ms) until
the host's federation runtime is ready, instead of surfacing a dead "Addon load
error" to the user. Genuine failures (bad URL, missing export, 404) still
rethrow immediately.
