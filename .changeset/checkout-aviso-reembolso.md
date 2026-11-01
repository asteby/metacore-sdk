---
"@asteby/storefront": minor
---

Avisos del contrato 1.28.0 sin inventar datos (aditivo): `CheckoutInfo` y `CartCheckoutState` suman `honored_after_cancel?: boolean` (el banco aprobó el pago después de que el comprador canceló y el pedido se creó de todos modos), y el tipo `CheckoutRefundStatus` (`refund_pending | refunded | refund_failed`). Nuevo `checkoutNotice(checkout)`: lee esos campos y entrega `{ honoredAfterCancel, refund: 'pending' | 'done' | 'review' | null, paidCheckoutId }`, tolerante con servidores anteriores (sin campos no hay aviso). `refund_failed` se presenta como `review` («lo estamos revisando»).
