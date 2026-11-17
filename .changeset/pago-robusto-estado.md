---
'@asteby/storefront': minor
'@asteby/storefront-react': minor
---

Pago robusto: el pago nunca queda en «Procesando…» sin fin. / Payment never ends in an endless "Processing…".

es: máquina de estados del pago con tiempo límite del reto bancario (`challengeTimeoutMs`, 3 min por omisión) y sondeo con retroceso; ayuda visible tras 20 s («¿Algo salió mal?») con Reintentar verificación, Verificar estado ahora y Cancelar y elegir otro método; al cerrar el modal se explica qué pasó; cuenta regresiva de `checkout.pay_blocked_until` («para evitar cobros dobles») y «Intentar de nuevo» al terminar; el botón de la tienda deja de decir «Procesando…» fuera de una petición real; modal más alto para el banco. Nuevos mensajes es/en y eventos `status`, `pay_blocked`, `challenge_timeout`; nuevos `verifyNow()`, `startOver()`, `blockedUntil` en `useEmbeddedPayment` y `onChooseOtherMethod` en `PaymentBrick`. Sin cambios de contrato con el servidor.

en: payment state machine with a bank-challenge time limit (`challengeTimeoutMs`, 3 min default) and backoff polling; visible help after 20 s ("Something went wrong?") with Retry verification, Check status now and Cancel and choose another method; closing the modal explains what happened; countdown from `checkout.pay_blocked_until` ("to avoid double charges") and "Try again" when it ends; the shop button no longer says "Processing…" outside a real request; taller bank modal. New es/en messages and events `status`, `pay_blocked`, `challenge_timeout`; new `verifyNow()`, `startOver()`, `blockedUntil` on `useEmbeddedPayment` and `onChooseOtherMethod` on `PaymentBrick`. No server contract changes.
