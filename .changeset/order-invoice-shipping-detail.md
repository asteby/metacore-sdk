---
"@asteby/storefront": minor
"@asteby/storefront-react": minor
---

feat: el comprador puede abrir y volver a descargar su factura y ver su envío desde la cuenta. `InvoiceDoc` gana `receiver`, `payment_method` y `payment_form` (contrato 1.14, opcionales). Nuevos `InvoiceDetail` (folio fiscal, serie y folio, fecha, estado, total y moneda, método y forma de pago, receptor, aviso de factura de prueba y botones Descargar PDF/XML, «en proceso» si falta uno) e `InvoiceHistory` («Mis facturas»: todas las facturas con sus descargas y enlaces al pedido). `InvoiceList` gana `detailHref` («Ver factura») y `testDownloads`. `ShippingServiceCard` gana `detail` (se abre: paquetería y servicio, días estimados, dirección de entrega, línea de tiempo del envío, número de guía con enlace de rastreo, o «Te mostraremos aquí el número de guía cuando salga tu paquete») y `ShipmentCard` gana `collapsible`. ES/EN, sin marcas hardcodeadas.
