---
'@asteby/metacore-runtime-react': minor
---

`DynamicTable` y `DynamicKanban` aceptan `isRowActionVisible?: RowActionPredicate` (`(action, row) => boolean`, tipo exportado): un predicado del consumidor que oculta acciones por fila. Se evalúa con AND junto a `requiresState` y `condition` de la metadata (solo puede ocultar más), si lanza la acción se oculta (fail-closed, `console.error`) y sin predicado el comportamiento no cambia. `GetDynamicColumns` recibe un 8º parámetro opcional `rowActionPredicate`; los factories custom pueden ignorarlo. Memoiza el predicado para no reconstruir las columnas.
