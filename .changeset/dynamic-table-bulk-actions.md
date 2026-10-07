---
'@asteby/metacore-runtime-react': minor
---

DynamicTable: nueva primitiva de acciones masivas. `extraBulkActions` (nodo o función `({ selectedRows, selectedIds, clearSelection, refresh }) => nodo`) pinta las acciones del host en la barra flotante de selección, junto al "Eliminar" integrado; `hideBulkDelete` oculta ese "Eliminar". La selección ahora se indexa por `id` del registro (antes por posición en la página) y, con paginación clásica, se vacía al cambiar de página, tamaño, orden, búsqueda o filtros de columna, de modo que una acción masiva nunca actúa sobre filas que el usuario ya no ve.
