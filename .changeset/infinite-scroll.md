---
'@asteby/metacore-runtime-react': minor
---

Scroll infinito con carga incremental en DynamicKanban y DynamicTable,
respetando la búsqueda y los filtros activos. Cero cambios de backend: se apoya
en el `page`/`per_page` que ya expone `/data/:model`.

- **Primitivos compartidos (`use-infinite-scroll`):** `dedupeById` (append puro
  que descarta ids ya presentes, estable en identidad cuando no hay altas) y
  `useInfiniteScrollSentinel` (IntersectionObserver sobre un sentinel; lee
  `onLoadMore`/`disabled` por ref para no recrear el observer en cada render;
  degrada a no-op donde no hay IntersectionObserver). Los usan ambas vistas.
- **Kanban incremental por lane:** una página global inicial (`pageSize`, 50 por
  defecto) pinta el tablero agrupado —y captura naturalmente la lane
  "sin asignar"— y luego cada lane rellena SU propia etapa al acercarse el
  scroll al fondo (`f_<group_by>=<stage>&page=n&per_page=lanePageSize`, 25 por
  defecto, sobre los filtros activos), con dedup por id y un skeleton chico al
  fondo. El contador del header muestra el total real de la etapa cuando la
  respuesta trae `meta.total` (`count/total`), si no el cargado. Cambiar
  filtros/búsqueda resetea la paginación de todas las lanes. El drag&drop
  optimista ajusta los totales de origen y destino (`applyLaneTotalsOnMove`)
  para que las lanes parciales sigan mostrando un `count/total` veraz, y los
  revierte si el PUT falla.
- **Tabla opt-in (`infiniteScroll?: boolean`, default `false`):** la paginación
  clásica queda intacta salvo que se active. Con el flag, un sentinel al fondo
  del contenedor de scroll pide la siguiente página y APPENDEA filas (dedup por
  id); el pager clásico se reemplaza por un indicador "N de total". Cambiar
  filtros/orden/búsqueda resetea a la página 1 y limpia el acumulado. El footer
  de totales (`/aggregate`) no cambia.
