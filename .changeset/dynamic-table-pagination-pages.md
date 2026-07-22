---
'@asteby/metacore-runtime-react': minor
---

DynamicTable: nuevo prop `pagination?: 'pages' | 'infinite'` con default `'pages'` (paginación clásica). El modo por defecto renderiza el footer `DataTablePagination` (selector de filas por página, "página X de Y", botones primera/anterior/siguiente/última) y cada cambio de página hace un fetch que REEMPLAZA las filas visibles (page/per_page contra el servidor, pageCount derivado de `meta.total`). Cambiar filtros/búsqueda/orden resetea a la página 1, y el tamaño de página elegido se persiste por tabla en localStorage (clave por `model`). El scroll infinito pasa a ser opt-in explícito con `pagination="infinite"`; el prop booleano `infiniteScroll` queda deprecado pero sigue funcionando cuando no se pasa `pagination`, así que los hosts existentes no cambian de comportamiento.
