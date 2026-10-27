---
"@asteby/storefront": minor
"@asteby/storefront-react": minor
---

fix: `InvoiceStatusCard` ya no muestra «Tu factura está lista» sin ninguna descarga. El servidor de cuenta nunca manda `url`/`xml_url` (la descarga es la ruta autenticada de la tienda), así que la tarjeta no pintaba botones. Nueva prop `fileHref(kind)` (tu ruta `/cuenta/pedidos/:id/facturas/:doc/:kind`, respaldada por `invoiceFileResponse`) y `InvoiceSummary.available_files` (`pdf`/`xml`, contrato 1.13): se ofrecen «Descargar PDF» y «Descargar XML» para los archivos que existen, si falta uno se avisa que sigue en proceso, y si no hay ninguno la tarjeta dice «Tu factura ya fue emitida», se refresca sola y no promete descarga. Con la ruta propia desaparece el texto de «enlaces vencen en 15 minutos». `InvoiceList` respeta `available_files` igual (ES/EN).
