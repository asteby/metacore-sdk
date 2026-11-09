---
"@asteby/storefront": minor
---

Devoluciones: `ReturnRequestInput` ahora tipa `reason?: ReturnReason` (`defective | not_wanted | wrong_item | warranty`, por defecto `not_wanted` en el servidor), `notes?: string` (máx. 500, `RETURN_NOTES_MAX`), `restock?` y `condition?` por línea. Helpers puros: `returnableLines(order)` (SKU, título, cantidad máxima), `returnEligibility(order, { returnsDays?, warrantyDays?, now? })` (`{ eligible, reason: 'not_delivered' | 'cancelled' | 'refunded' | 'window_expired' | 'no_lines', deadline?, warrantyOnly? }`), `orderDeliveredAt`, `isReturnReason` y los textos es/en `returnMessages` / `returnIneligibleMessage` / `returnReasonLabel`. La fecha de entrega solo se lee del pedido (paso `delivered` del progreso, `delivered_at` de los envíos o de la recogida); sin fecha, el pedido es elegible sin `deadline`. Aditivo: nada existente cambia.
