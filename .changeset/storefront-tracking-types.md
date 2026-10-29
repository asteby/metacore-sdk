---
'@asteby/storefront': minor
---

Rastreo público de envíos: tipos `TrackingView`, `TrackingEventView`, `TrackingLookupInput` y `TrackingLookupResult`, y `sf.tracking.lookup(input)` (`POST /storefront/customer/track`, por número de pedido + correo o por guía, sin sesión). Cualquier falla se pliega en `not_found`, `rate_limited` (con `retryAfter`) o `unavailable`; nunca lanza. Requiere que la tienda habilite la ruta.
