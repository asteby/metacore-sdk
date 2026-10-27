---
"@asteby/storefront": minor
"@asteby/storefront-react": minor
---

feat(fiscal): corregir y reintentar una factura que el SAT/PAC rechazó por un dato del comprador (contrato Storefront 1.18, aditivo). `InvoiceSummary` suma `reason_message` (frase en español lista para mostrar, sin jerga ni texto del proveedor), `reason_field`, `submitted` (los datos enviados) y `retries_left`. En `@asteby/storefront-react/fiscal`: `invoiceCorrection(invoice)` entrega `values` para prellenar `FiscalIdentityFields`, `errors` que marcan el campo rechazado, `canCorrect` y `retriesLeft`; `InvoiceRejectionNotice` pinta el aviso con los intentos que quedan; `InvoiceStatusCard` muestra el `reason_message` del servidor (en `needs_data` y `needs_review`) en lugar de la tabla genérica. Nuevos textos `status.correction.*` (es/en).
