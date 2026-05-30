---
"@asteby/metacore-runtime-react": minor
"@asteby/metacore-sdk": minor
---

Acciones con `placement` (`row` | `table` | `create`) y nuevo primitivo `<ModelActionToolbar>`.

`ActionMetadata`/`ActionDefinition` ganan `placement`, espejando `manifest/v3` Action.placement del kernel (v0.30.0):

- `row` (default) — acción por fila dentro de `<DynamicTable>` (comportamiento actual).
- `table` — botón en la toolbar de la página, sin contexto de record.
- `create` — botón en la toolbar que **reemplaza** el botón "crear" genérico, para addons que traen una experiencia de creación custom (p.ej. un asiento contable con líneas débito/crédito).

`<ModelActionToolbar>` (+ hook `useModelActions`) es el primitivo genérico que renderiza esos triggers de nivel página y monta el `ActionModalDispatcher` (record vacío para `create`). Resuelve tanto modales federados custom (vía el action registry) como el form declarativo genérico. `DynamicCRUDPage` lo consume internamente y suprime su botón crear cuando existe una acción `create`; `DynamicTable` excluye los placements `table`/`create` de la columna de acciones por fila. Los hosts ya no reimplementan el plumbing de botones de acción — montan `<ModelActionToolbar>` y listo.
