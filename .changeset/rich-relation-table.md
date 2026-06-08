---
'@asteby/metacore-runtime-react': minor
---

Render one_to_many relations as a rich table (headers + currency/image/date/badge cells)

`OneToManyRelation` now renders the child list as a real metadata-driven table
using the same metacore-ui `<Table>` primitives and the exact
`makeDefaultGetDynamicColumns` cell factory as `<DynamicTable>`, instead of a
bare flex grid of unlabeled values. Line items now get column headers, money in
the org currency right-aligned (e.g. `100,00 MXN`), FK thumbnails + labels,
dates in the org timezone, status/option badges and creator names — matching
the main dynamic table. The inline edit (DynamicForm dialog) and delete
(AlertDialog) actions are preserved as a trailing actions column.

The org `timeZone`/`currency` contexts were extracted from
`dialogs/dynamic-record` into a shared `org-runtime-context` module so the
relation table can consume them without a circular import. `ManyToManyRelation`
is unchanged.
