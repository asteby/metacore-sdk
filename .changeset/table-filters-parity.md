---
'@asteby/metacore-runtime-react': minor
---

Paridad de la experiencia pro de filtros en DynamicTable (vista tabla de los
módulos dinámicos), igualando al kanban.

- **Prefetch de facetas en la tabla:** al resolver la metadata se precargan en
  paralelo (dedup por firma, `allSettled`) las facetas de todos los campos facet,
  sembrando sus `options`. Abrir el filtro de una columna de texto en el header
  ya muestra el combobox con valores + counts al instante, sin "Cargando…"; el
  spinner queda solo para el refetch con búsqueda.
- **i18n de opciones en la tabla:** las opciones (stages y cualquier key i18n del
  manifest) se traducen con `t(label, {defaultValue})` en runtime-react antes de
  pasarlas al ui package, tanto en los filtros de header como en los chips y
  resúmenes de valor.
- **Fila de chips de filtros activos sobre la tabla:** debajo de la toolbar,
  removibles ("Campo: valor(es) ×" + "Limpiar todo"), con el color del valor
  cuando aplica (p.ej. la etapa). Extraído a un componente compartido
  `FilterChipsRow` (con `summarizeFilterValues`/`chipValueColor`/
  `translateOptionLabels`) reusado por el kanban y la tabla — sin duplicar.
- **Stage-select en la tabla:** la columna `group_by`/stage sin opciones propias
  ofrece el select con las etapas del pipeline (traducidas, con color), no un
  cuadro de texto — sale del motor compartido; confirmado con test.
