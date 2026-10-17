---
'@asteby/storefront': minor
---

Alinea los tipos con la API real: `CheckoutResult.order.number` puede ser `null`, `payment.instructions`, `checkout` (`id`, `status`, `total`, `stock_hold_expires_at`), `StockLevel.quantity_available` admite `null`, y los artículos aceptan `first` hasta 50. Agrega `checkouts.get(id)` (pedido para invitados, `GET /storefront/checkouts/:id`, alcance `checkout:write`) y su ruta en el mock.
