---
"@asteby/storefront-react": patch
---

El Device ID de Mercado Pago ya se envía: el que genera MercadoPago.js v2 mide ~231 caracteres y `deviceSessionId()` lo descartaba por pasar de 200 (`DEVICE_SESSION_ID_MAX` ahora 512), así que el pago salía sin `X-meli-session-id`. Además `collect()` espera hasta `deviceWaitMs` (2.5 s por defecto) a que `window.MP_DEVICE_SESSION_ID` exista —MP lo crea 0.5-2 s después de `new MercadoPago()`— y, si nunca aparece, lo omite sin fallar el pago.
