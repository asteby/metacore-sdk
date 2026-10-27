---
"@asteby/storefront-react": minor
---

feat(account): vista previa y descargas de la factura. `InvoiceFileLinks` (usado por `InvoiceList`, `InvoiceDetail`, `InvoiceHistory`) añade «Ver factura» (`InvoicePreviewDialog`: PDF incrustado, o el CFDI leído del XML + «El PDF se está generando» con reintento; en móvil abre pestaña nueva) y descarga con fetch: el archivo se guarda con el nombre del servidor y un error (409 en proceso, 404, sesión) se muestra como aviso en la página en vez de guardar `pdf.txt`. `invoiceFileResponse`: `Content-Disposition` con `filename*`, `?inline=1` (opción `request`/`disposition`) sirve el PDF `inline` con `frame-ancestors 'self'`, el XML sale `application/xml; charset=utf-8`, y todo error es JSON `{ error: { code, message } }` (nuevo `409 not_ready`). El enlace «Ver factura» al detalle pasa a «Ver detalle». Presupuesto de tamaño 22 → 25 KB.
