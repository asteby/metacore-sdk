---
'@asteby/metacore-runtime-react': minor
---

feat(kanban): agrupar filtros globales en un sheet lateral + filtro por columna

- **Filtros globales** dejan de spillear como chips inline: ahora un botón "Filtros"
  (con contador de activos) abre un **sheet lateral** con todos los controles apilados
  (mismo motor server-side `useDynamicFilters`). La búsqueda global queda inline.
- **Filtro por lane (stage):** cada columna tiene un icono de embudo → elige un campo
  + un valor y **filtra solo las cards de ese stage** (client-side, instantáneo, sin
  refetch). Un indicador bajo el header muestra el filtro activo (campo: valor) con
  un botón para limpiarlo; el header muestra `filtradas/total`.
