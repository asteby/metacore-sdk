---
'@asteby/metacore-pwa': patch
---

Make Web Push subscription robust and self-healing.

- `subscribe()` now drops a stale/rotated subscription whose `applicationServerKey` doesn't match (or legacy gcm_sender_id subs) before re-subscribing, fixing the intermittent "Error al activar notificaciones push" on return.
- It always re-POSTs to the backend so an expired/deactivated subscription is reactivated.
- `PWAProvider` re-validates the subscription when the app regains focus / becomes visible (subscriptions silently expire after hours idle — push stopped arriving until a full reload; now it recovers on return).
- New `subscribe({ silent, allowPrompt })` options; auto/background paths run silently and never prompt unexpectedly.
