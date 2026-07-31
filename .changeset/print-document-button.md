---
"@asteby/metacore-runtime-react": minor
---

PrintDocumentButton: botón reusable de impresión de documentos

Componente drop-in sobre usePrintDocument: renderiza un <button> (estilable con
className) que imprime/descarga/abre un documento del servidor, se deshabilita
mientras baja el PDF (aria-busy) y reporta errores por onError. Evita recablear
el hook + estado de carga en cada addon.
