---
'@asteby/storefront': minor
'@asteby/storefront-react': minor
---

El detalle del pedido muestra el envío que el comprador eligió aunque aún no exista guía (contrato 1.12 de la API de tienda, aditivo). `@asteby/storefront`: tipo `OrderShippingService` y `Order.shipping_service` (`title`, `carrier`, `carrier_logo_key`, `eta_days_min`, `eta_days_max`); el mock de cuenta lo incluye. `@asteby/storefront-react/account`: `ShippingServiceCard` (servicio, días hábiles «Llega en 1 a 3 días hábiles» y logo de la paquetería por el slot `renderCarrierMark`, es/en, para cualquier paquetería: sin logo conocido queda el nombre), más `orderShippingService(order)` y `shippingServiceEta(...)`. Con un servidor anterior (sin `shipping_service`) usa el texto de `shipping_method` (`shipping:<servicio>`). La tarjeta no recibe costos ni ids. Sube el presupuesto del bundle de pedidos a 19 KB.
