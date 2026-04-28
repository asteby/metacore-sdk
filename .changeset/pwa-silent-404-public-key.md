---
'@asteby/metacore-pwa': patch
---

Treat a 404 on `/push/public-key` as a no-op instead of an error.

Push notifications are opt-in on the kernel — gated by `EnablePush` (which itself requires VAPID keys). Apps that boot without VAPID got a noisy `Failed to initialize push service: AxiosError 404` console error on every page load. The init handler now swallows 404s silently (the deployment intentionally has no push) and surfaces every other error class so misconfigured keys still show up.
