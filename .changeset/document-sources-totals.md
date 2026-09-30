---
"@asteby/metacore-runtime-react": minor
---

`DocumentPage`: los contadores de los botones inteligentes y de las pestañas «records» usan el total del servidor (`meta.total`) en lugar del número de filas traídas. Una ficha de cliente con 312 ventas mostraba «50» (el tamaño de la página); ahora muestra 312. `useDocumentSources` devuelve `totals` y `DocumentContext` lo expone (opcional; sin `meta.total` el contador sigue siendo el largo de las filas). Sin cambios para los specs existentes.
