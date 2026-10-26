---
'@asteby/storefront-react': minor
---

`PaymentSummary`: cada pago lleva `data-sf-payment-method-key` (`card`, `oxxo`, `spei`, `wallet`…, o `unknown`) para que la tienda ponga su ícono por método, y `paymentMethodKey(payment)` se exporta. `ShipmentCard`: el título dice la paquetería con una etiqueta «Paquetería» (`data-sf-shipment-eyebrow`) cuando se conoce; sin paquetería sigue «Envío».
