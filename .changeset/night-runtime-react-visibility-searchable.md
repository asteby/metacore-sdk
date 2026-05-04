---
"@asteby/metacore-runtime-react": minor
---

feat(runtime-react): leer `visibility` y `searchable` en metadata de columnas.

- `ColumnDefinition` tipa los nuevos campos `visibility?` (`"all" | "table" | "modal" | "list"`) y `searchable?` que el kernel ya emite (`manifest.ColumnDef`). Backwards compat: zero-value preserva el comportamiento previo.
- `<DynamicTable>` ahora oculta del listado las columnas con `visibility === "modal"` (y `"list"`) además del legacy `hidden`. Las columnas sin `visibility` o con `"all" | "table"` siguen visibles.
- Cuando al menos una columna declara `searchable` el SDK acota el global search a esas columnas vía el nuevo query param `search_columns=<keys>`. Si todas las columnas se opt-out (`searchable: false`), el SDK deja de mandar `search` al backend. Si ninguna columna trae el flag (kernel anterior a v0.8.x), no se cambia nada.
- Nuevos helpers públicos `isColumnVisibleInTable(col)` y `getSearchableColumnKeys(metadata)` exportados desde el barrel; tests con metadata mock cubren los pasos legacy + opt-in + opt-out total.
