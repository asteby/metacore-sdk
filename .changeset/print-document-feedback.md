---
"@asteby/metacore-runtime-react": patch
---

Auditoría Ronda D: «Descargar Factura CFDI» no daba ninguna señal. `usePrintDocument` ahora muestra un toast de progreso, uno de éxito y, si falla, el motivo que responde el servidor (también cuando el cuerpo llega como Blob); la promesa sigue rechazando. `feedback: false` lo silencia y `PrintDocumentButton` deja el toast de error al llamador cuando pasa `onError`.
