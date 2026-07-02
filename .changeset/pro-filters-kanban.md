---
'@asteby/metacore-runtime-react': minor
'@asteby/metacore-ui': minor
---

Filtros pro para tabla y kanban dinámicos.

- **Etapa como select (kanban/tabla):** una columna `group_by` sin opciones
  propias hereda las etapas del pipeline (`metadata.stages`, con su color) como
  un select real en lugar de caer a un cuadro de texto "Contiene...".
- **Filtros por facetas:** las columnas de texto filtrables se convierten en un
  selector de valores (`filterType: 'facet'`) que carga de forma perezosa los
  valores distintos + su conteo desde `GET /data/:model/facets` al abrir el
  popover, con búsqueda server-side. Degrada con gracia al input "Contiene..."
  (ILIKE) si el endpoint falla, devuelve vacío o no está disponible, y mantiene
  ese affordance de texto libre incluso cuando hay opciones. Las columnas de
  texto largo (`body`/`description`, `cellStyle: truncate-text`, tipos
  json/long_text) se quedan como texto plano. Nuevo `ColumnFilterControl`
  `loadOptions` y `FilterOption.count` en `@asteby/metacore-ui`; hook compartido
  `useFacetLoaders` y `filterType: 'facet'` en `@asteby/metacore-runtime-react`.
- **Búsqueda por columna del kanban:** cada lane tiene un icono de búsqueda que
  expande un input inline (autofocus, colapsa con Escape) filtrando client-side
  las tarjetas de esa columna por título y valores de campo visibles. Convive y
  se combina (AND) con el embudo por campo, que ahora ofrece un select de
  valores cuando el campo tiene opciones conocidas.
- **Panel de filtros rediseñado:** fila de chips activos removibles bajo la
  toolbar (con "Limpiar todo"), y dentro del Sheet los filtros con selección se
  agrupan arriba, el resto ordenado alfabéticamente, con footer sticky y conteo
  de activos.
