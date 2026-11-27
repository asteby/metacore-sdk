---
'@asteby/storefront': minor
'@asteby/storefront-react': minor
---

Aviso de envío de la ficha de producto para preventa y venta bajo pedido. `@asteby/storefront`: `availabilityShipNotice(availability, locale, { messages, formatDate })` (pura) devuelve `{ status, date, headline, note }` con «Este producto se enviará el: {fecha}» (solo si el servidor mandó la fecha: `preorder_release_at` en preventa, `restock_eta` en bajo pedido) y la nota fija («En la compra de productos en preventa, el pedido se enviará completo hasta la fecha de disponibilidad»); cualquier otro estado da `null`. `formatDate` deja a la tienda usar su estilo de fecha. Textos nuevos es/en: `notice.ships_on`, `notice.preorder_note`, `notice.backorder_note`. `@asteby/storefront-react`: `<AvailabilityShipNotice />` (sin DOM si no hay nada que decir; se viste con `[data-sf-ship-notice]`, `[data-sf-ship-notice-title]` y `[data-sf-ship-notice-note]`).
