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
- **Panel de filtros rediseñado (nivel Linear/Notion):** el Sheet deja de ser
  una lista de botones grises idénticos: cada campo es una fila tipo settings
  con icono por tipo de dato (Hash número, Calendar fecha, CircleDot etapa, Tag
  select/facet, ToggleLeft boolean, Type texto), label y resumen del valor
  activo a la derecha ("Cualquiera" en muted si no hay). Nueva variante
  `ColumnFilterControl` `variant='row'` con props `icon` y `valueSummary`.
  Popovers con `rounded-xl`, sombra, header del campo (el input "Contiene..."
  nunca es contenido crudo sin jerarquía), opciones con checkbox + dot de color
  + count a la derecha. Filtros con selección agrupados arriba, resto
  alfabético, footer sticky con conteo. Fila de chips activos removibles bajo la
  toolbar (con dot de color del valor, p.ej. color de la etapa) y "Limpiar
  todo". Header de lane del kanban con acciones (buscar/embudo) en hover-reveal
  para un board limpio. Pensado dark-mode-first (muted/accent del theme).

La URL del endpoint de facetas se deriva como el endpoint de agregados de
DynamicTable: `<endpoint>/facets` (o `/data/<model>/facets` como fallback), así
funciona tanto con `endpoint="/data/:model/me"` como sin él.
