---
"@asteby/metacore-genui": minor
---

Pagina como datos: `genui.page-graph/v1` (arbol de nodos con id estable, visibilidad por permiso/ajuste/estado, `fallback_node`), `parsePageGraph`, `resolveGraph`, `indexGraph`, `pageToGraph` y `PageGraphView` con aislamiento de error por bloque. Bloques de tablero reutilizables: `KpiTile`, `Delta`, `TrendSpark`, `RankedList`, `SeriesView`, `BlockState`. `section` y los bloques del nucleo usan `BlockState` para cargando/error/vacio.
