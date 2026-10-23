---
"@asteby/storefront-react": minor
---

Nuevo subpath `/checkout`: `DeliveryOptions` (tarifas de envío con marca y nombre comercial de la paquetería, llegada en días hábiles, insignias «Más económico» / «Más rápido», una sola nota de vigencia en la hora del comprador y esqueleto al recotizar) y un catálogo compartido de marcas (`BrandMark`, `brandName`, `brandKey`) para paqueterías, tarjetas, billeteras y puntos de efectivo. `PaymentMethodSection` dibuja las marcas (redes de tarjeta con `cardBrands`, puntos de efectivo, Mercado Pago en sus filas; `brandMarks={false}` para apagarlas) y ahora guarda la entrega antes de mostrar el total con cualquier forma de pago, no solo con tarjeta: el botón ya no muestra un total sin envío. Tarifa vencida o cambiada: `isQuoteChange` y `matchRate` para recotizar sin perder la dirección ni el servicio elegido, `DeliveryOptions requoted` y `syncDelivery` puede resolver `'requote'` (aviso, no error).
