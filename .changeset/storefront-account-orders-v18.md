---
'@asteby/storefront': minor
---

Cuenta del comprador (contrato Storefront API 1.8): tipos de `Order` con `progress`, `next_action`, `shipments[]`, `shipments_summary`, `invoices[]` (facturas y notas de crédito), `payments[]`, `refunds[]` y `degraded[]`; `Shipment`, `GeoHint`, `InvoiceDoc`, `PendingPayment`, `InvoiceFile` (enums abiertos: un valor desconocido no rompe). Cliente: `customer.pendingPayments()` y `customer.invoiceFile()` (ruta autenticada `order_invoice_file`: devuelve el archivo en base64, nunca una URL del PAC). Helpers puros `orderProgress`, `nextAction`, `sortTrackingEvents`, `isTestShipment`, `isTestInvoice`, `safeTrackingUrl`, `groupInvoiceDocs`, `invoiceFileBytes`. El mock sirve pedidos de demostración en todos los estados y fichas de pago pendientes.
