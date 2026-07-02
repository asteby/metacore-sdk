---
'@asteby/metacore-runtime-react': patch
'@asteby/metacore-ui': minor
---

Fixes del embudo por columna del kanban (LaneFilterButton).

- **Precarga de opciones dinámicas:** el value-picker del embudo ahora usa el
  MISMO combobox pro que el Sheet — si el campo elegido tiene options estáticas
  o `loadOptions` (facet), renderiza el combobox multi-select con carga lazy
  (counts, buscador "Buscar valores...", estados de carga). Antes un campo facet
  (p.ej. "Repo") caía al input crudo "Valor..." porque sus options aún no
  estaban cargadas. Solo cae a input de texto cuando el campo es texto libre sin
  facets. Nuevo componente compartible `FilterValueCombobox` en
  `@asteby/metacore-ui`. El filtrado del lane sigue client-side: igualdad/IN
  para valores de select/facet, substring para texto libre.
- **Traducción de opciones:** las opciones de Stage (y cualquier option con key
  i18n del manifest) se traducen con `t(label, {defaultValue})` en runtime-react
  ANTES de pasarlas al control (ColumnFilterControl vive en ui, sin i18n). Aplica
  al embudo, al Sheet, a los chips y a los resúmenes de valor; el valor activo de
  stage se muestra traducido y con su color.
- **Diseño del popover del embudo:** select de campo y control de valor a ancho
  completo, popover más ancho (`w-72`), combobox con borde redondeado, botones
  Limpiar/Aplicar full-width en fila — al nivel del resto del rediseño.
- **Prefetch de facetas:** al resolver la metadata se precargan en paralelo las
  facetas de TODOS los campos facet (un `api.get` por campo, dedupeado por firma,
  `allSettled` para que un campo con error no rompa el resto), sembrando el cache
  del loader y poblando las `options` del `ColumnFilterConfig`. Así el popover
  del Sheet y el value-picker del lane abren instantáneos con valores + counts,
  sin "Cargando…"; el spinner queda solo para el refetch con búsqueda (`q`).
  `useFacetLoaders` ahora expone `prefetchFacets` y `facetOptions`.
