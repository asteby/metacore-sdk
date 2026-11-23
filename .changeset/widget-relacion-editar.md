---
"@asteby/metacore-runtime-react": minor
---

Los widgets de relación (`registerRelationWidget`) también se pintan al EDITAR el padre, no solo al crear.

- Al editar, el modal lee las filas ya guardadas de cada relación con widget (completas, paginando; cada fila trae su `id` en `DraftRow.id`) y las entrega en `rows`, con `mode: 'edit'`. El widget va en solo lectura mientras se leen.
- Al guardar envía `_children[relación]` (con `id` en las filas existentes) SOLO si el usuario cambió las filas; el kernel actualiza las que traen `id`, crea las nuevas y borra las que el widget quitó del arreglo. Un widget que reemplaza filas debe conservar `row.id`.
- Nunca borra a ciegas: si no se pudieron leer todas las filas (error, página vacía antes del total, más páginas de las que se leen), la relación no se envía.
- Las relaciones sin widget siguen en su panel (`DynamicRelations`); las que pinta un widget salen del panel para no duplicarse. Sin widget registrado nada cambia.
- Nuevos: `DraftRow.id`, `makeDraftRow(values, key, id)`, `serializeDraftRows(rows, cols, { includeId })`, prop `mode` del widget.
