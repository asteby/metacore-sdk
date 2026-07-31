---
"@asteby/metacore-runtime-react": minor
---

usePrintDocument: primitivo reusable para imprimir documentos del servidor

Nuevo hook que cualquier addon federado usa para imprimir/descargar/abrir un
documento renderizado por el motor de docs de ops (ticket, comprobante, orden):
GET /api/data/:model/:id/documents/:key.pdf. Fetch con auth vía el ApiClient
inyectado (el endpoint es Bearer-gated, no se puede window.open directo), blob →
iframe print (modo default, ideal para ticket térmico), download u open. Era el
primitivo de impresión que faltaba en el SDK (había 0). Habilita el auto-print del
POS al cerrar venta.
