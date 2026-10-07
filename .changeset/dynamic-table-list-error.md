---
'@asteby/metacore-runtime-react': minor
---

DynamicTable: un fallo del endpoint de lista que no es 403 (500, red o `success: false`) ya no se ve como "No se encontraron resultados": muestra "No se pudieron cargar los datos" con un botón "Reintentar" que vuelve a pedir la lista (claves `dynamic.load_error_title`, `dynamic.load_error_hint`, `dynamic.retry`). Nueva prop opcional `emptyState` para mostrar contenido de primer uso cuando la lista carga bien, está vacía y no hay búsqueda ni filtros activos; nunca tapa un error ni un 403.
