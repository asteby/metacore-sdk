---
'@asteby/metacore-pwa': minor
---

PWAProvider now auto-subscribes to Web Push once notification permission is granted (new `autoSubscribeOnGranted` prop, default `true`).

Previously, having notification permission was not enough: nothing created the `PushSubscription`, so the server had nothing to send to and background/mobile push silently never arrived (apps had to wire `subscribeToPush()` themselves, which was easy to miss). The provider now subscribes on mount when permission is already granted, and watches for a later grant, so every consumer gets working push by default. Set `autoSubscribeOnGranted={false}` to manage subscription manually.
