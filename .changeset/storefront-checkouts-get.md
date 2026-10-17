---
'@asteby/storefront': minor
---

Agrega `checkouts.get(id)` (`GET /storefront/checkouts/:id`, token de servidor) para leer un checkout ya colocado: devuelve la misma forma que `carts.checkout` y `null` si no existe. `order.number` sigue pudiendo ser `null` unos cientos de milisegundos tras el pago; la tienda consulta una o dos veces más y, si sigue `null`, mantiene el aviso de que el folio llegará por correo. La ruta la agrega el addon `storefront_cart` (asteby-hq/addons, folio del pedido) y el mock la implementa.
