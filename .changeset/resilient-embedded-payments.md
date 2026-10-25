---
"@asteby/storefront": minor
"@asteby/storefront-react": minor
---

Cobro con tarjeta resiliente, generalizado desde store-protekauto para que ninguna tienda lo copie.

`@asteby/storefront`: `StorefrontError` conserva lo que OPS manda en `error.*` (`retryable`, `retryAfter`, `checkoutId`, `cost`, `messageEn`) y se agrega `classifyPaymentError(err)` -> `{ kind, retryable }` sin textos, igual en servidor y navegador (honra `retryable:false` y los códigos `payment_provider_rejected`, `payment_provider_misconfigured`, `unavailable`, `invalid_state`). `PaymentAttemptStatus` suma `none` (solo de la ruta de estado de la tienda).

`@asteby/storefront-react`: `createResilientTransport` (misma clave, consulta de estado, una sola petición ante `retryable:false`), `PaymentHttpError.retryable/kind`, `usePaymentRecovery` y `<PaymentRecovery>` (textos en es-MX sobrescribibles, alternativas desde las `choices`); `jsonPayRoute` y handlers que responden siempre JSON con `retryable` y `kind` y 500 en vez de 502-504; `/estado` sin sesión responde 200 `none`. Formulario de tarjeta estable: se monta una vez, `MountedPaymentForm.update({ amount })` (Mercado Pago: `controller.update`), cola de montajes con `create` acotado en el tiempo, sin remontar al teclear el correo ni durante el cobro; el hook sigue verificando ~2 min tras un resultado desconocido; `checkoutShouldRevalidate`. `AddressFields`: un solo escritor, respeta foco y edición del comprador, colonia solo si es única y marca sus eventos (`isAddressFillEvent`).
