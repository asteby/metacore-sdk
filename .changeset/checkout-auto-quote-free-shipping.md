---
'@asteby/storefront-react': minor
'@asteby/storefront': minor
---

Checkout en un solo paso: las tarifas de envío cargan solas al completar la dirección.

Antes las tarifas solo existían después de pulsar «Pagar» con la entrega `ship:` (se guardaba la dirección, se recargaba la página y recién ahí aparecían las paqueterías para elegir y volver a pulsar «Pagar»: dos pasos). Ahora:

- `useAutoQuote` (`@asteby/storefront-react/checkout`): observa el formulario, y cuando hay CP válido, estado, ciudad, colonia y calle, espera 600 ms sin teclear y llama al `quote(address, signal)` de la tienda (guardar dirección + leer `delivery-options`). Solo re-cotiza cuando cambian campos que afectan el precio (país, CP, estado, ciudad); calle, número, teléfono o referencia no. Cancela respuestas viejas, expone `status` (`idle|waiting|loading|ready|error`), `retry`, y `defaultValue` (la tarifa guardada si sigue ofrecida; si no, la más barata sin recolección). Helpers: `defaultRate`, `quoteFingerprint`, `readQuoteAddress`.
- `<DeliveryOptions free>`: con el envío gratis (`DeliveryOptions.free`, que calcula el servidor) no hay selector de paquetería: muestra «Envío gratis» y manda la tarifa en un campo oculto para ir directo al pago. `announceReady` agrega un estado accesible («Opciones de envío listas (n)») y el error/carga ya eran `role=alert`/`role=status`.
- `@asteby/storefront`: `DeliveryOptions` gana `fixed` y `free` (aditivos; los llena `storefront_cart` con su ajuste `shipping_quote_mode`) y el mock acepta `shippingQuoteMode: 'fixed_when_free'`.

El umbral de envío gratis y el precio fijo son configuración de la organización (Ventas → Envíos y ajuste `shipping_quote_mode` de storefront_cart); nada se calcula ni se escribe en el SDK.
