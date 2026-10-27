---
"@asteby/storefront-react": minor
---

Páginas de cuenta sin redundancia: tarjetas compactas `ShipmentSummaryCard`, `InvoiceSummaryCard` y `PaymentSummaryCard` (un par de líneas clave y UN enlace a su página), páginas completas `ShipmentDetail` (entrega, línea de tiempo con fechas, guía, rastreo, mapa, movimientos, ayuda) y `PaymentDetail` (método, monto, estado, fecha, referencia enmascarada, reembolsos, totales), y `OrderPageHeader` (migas y estado único), `OrderSandboxNotice` (aviso de modo de prueba una sola vez), `OrderTotals` e `isSandboxOrder`. `OrderCard`/`OrderList` ganan `variant="row"` (fila de lista: estado, fecha, total y «Ver detalle») e `InvoiceHistory` gana `compact`. Textos es/en nuevos (`summary.*`, `shipmentPage.*`, `paymentPage.*`, `totals.*`, `order.viewDetail`...).
