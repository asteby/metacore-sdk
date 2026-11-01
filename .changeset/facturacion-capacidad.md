---
"@asteby/storefront": minor
"@asteby/storefront-react": minor
---

Interruptor de facturación por organización (contrato Storefront 1.29). `@asteby/storefront`: `invoicingDisabled(caps)` / `invoicingEnabled(caps)` son la única respuesta a «¿esta tienda habla de facturas?» (solo un `invoicing.unavailable_reason: 'disabled'` explícito la apaga; `no_provider`, `not_configured`, `no_issuer`, un `invoicing` ausente o `available: true` dejan todo como hoy); `InvoicingCapabilities.unavailable_reason` tipado; el mock gana `invoicingDisabled: true` (capabilities `disabled`, sin `fiscal_profiles`, 404 en las rutas de factura y de perfiles fiscales, pedidos en reposo). `@asteby/storefront-react`: `FiscalReason` gana `'disabled'` (`loadFiscalContext`), `InvoiceStatusCard` con `availability="disabled"` no pinta nada (ni el aviso «no habilitada»), y `loadAuthCapabilities` conserva `invoicing` solo cuando está apagada, para que la tienda lo lea de la misma llamada cacheada.
