---
"@asteby/storefront-react": patch
---

El Payment Element de Stripe se crea con métodos dinámicos: ya no manda `paymentMethodTypes: ['card']`. Stripe dejó de aceptar `payment_method_types` en el PaymentIntent («The `payment_method_types` parameter is no longer supported. Payment methods are now managed from your Dashboard settings», HTTP 400) y todo pago con tarjeta fallaba en el servidor; el addon `stripe` ahora crea el cobro con `automatic_payment_methods` y el formulario debe crearse sin tipos explícitos para que ambos lados coincidan (Stripe no confirma un token de un tipo en un cobro del otro). Actualizar junto con `@asteby/addon-stripe`. README y prueba actualizados.
