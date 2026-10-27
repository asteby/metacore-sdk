---
'@asteby/storefront-react': patch
'@asteby/storefront': patch
---

Pago con tarjeta: si el banco rechaza el reto 3DS, ya no se muestra «gracias». `GET checkouts/:id` deja el checkout en `pending` (se permite otro intento) pero marca `payment.outcome: 'rejected'`; `checkoutToAttempt` lo leía como «pendiente sin acción» (en revisión) y `PaymentMethodSection` cerraba el pedido. Ahora lo traduce a un rechazo (`decline_code`, `next_step`, `retryable`, `message`) y el formulario muestra el motivo y permite reintentar. Los tipos de `CheckoutPayment` incluyen esos campos.
