---
'@asteby/storefront-react': patch
---

Checkout en vivo: el marcador «Por confirmar» nunca es una calle. `useLiveDelivery` mantiene el pago bloqueado («Escribe tu calle y número») hasta que `address1` tenga una calle real (`streetOk`, `streetName`) y `DeliveryStatus` lo explica en línea (`street`); nuevos `PENDING_STREET`, `isPendingStreet` y `withoutPendingStreet` (en `checkout` y `checkout/server`) para vaciar el valor guardado en el formulario y rechazarlo en el servidor aunque llegue manipulado.
