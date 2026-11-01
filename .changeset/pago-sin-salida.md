---
"@asteby/storefront": minor
"@asteby/storefront-react": minor
---

Pago sin estado sin salida y sin éxito falso (aditivo, compatible).

- `@asteby/storefront`: `checkouts.cancel(id, { reason })` (`POST /storefront/checkouts/:id/cancel` de storefront_cart) para cancelar un checkout cuyo pago NO está aprobado (cancelar, cambiar datos o pagar de otra forma). Tipos `CheckoutCancelReason` y `CheckoutCancelResult` (`cancel.provider_cancelled` / `cancel.orphaned`). El mock lo sirve (`409 already_paid` si ya se pagó; un reto 3DS abierto se cierra como `orphaned`). Un servidor sin la ruta (storefront_cart anterior al contrato 1.26.0) da `StorefrontError` con `code: 'cancel_unsupported'` (`isCancelUnsupported(err)`, `CANCEL_UNSUPPORTED`) para ocultar «cancelar»; un 404 de un checkout inexistente sigue siendo `not_found`. Tipos opcionales del contrato 1.26.0: `Cart.checkout` (`CartCheckoutState`: `status`, `close_reason`, `attempt` con `status` y `orphaned`).
- `@asteby/storefront-react/payments`:
  - `useEmbeddedPayment`: evento `verify_timeout`, estado `verifyTimedOut` y `recheck()` cuando la revisión en segundo plano de un resultado desconocido se acaba sin respuesta (antes quedaba «verificando» para siempre). La llave del intento no cambia y no se puede cobrar de nuevo desde el formulario.
  - `PaymentMethodSection`: prop opcional `onPending`. Con ella, `in_review` (pago SIN aprobar, p. ej. Mercado Pago en `pending_challenge`) va ahí y no a `onDone`; sin ella, todo igual que antes. Adopción recomendada en todas las tiendas (ejemplo en el README, «Pago por confirmar»): `onDone={() => navigate(gracias)}` + `onPending={() => revalidator.revalidate()}`, y en `settle` cerrar la compra solo con `approved` / `voucher`.
  - `usePendingPaymentWatch` (+ `watchesAttempt`, `pendingPhase`, `nextCheckDelay`, `firstSeenAt`, `formatCountdown`): vigilancia sin cabeza del panel «pago por confirmar»: revisión automática del estado real con espera creciente, fase `stuck` tras 2.5 min con salidas, y un botón que nunca se queda girando.
  - `purchaseResultView(receipt)`: regla común de la página de gracias: éxito SOLO con el pago aprobado y enlace al pedido SOLO cuando existe (`order.number`).
