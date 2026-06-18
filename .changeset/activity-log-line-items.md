---
"@asteby/metacore-runtime-react": minor
---

Activity log (record history) renders jsonb line items as a table and localizes
relation field labels.

- **Line-items render as the shared `CollectionCell` mini-table** instead of raw
  `JSON.stringify`. A jsonb array-of-objects value (e.g. a transfer's `items`,
  directly or JSON-string-encoded) now shows a localized mini-table with
  resolved relation chips (when the backend injects the `{value,label,image}`
  siblings into the snapshot) — matching the detail view. Uses the column's
  declared `item_fields` when present.
- **Relation field labels localize.** `resolveColumn` now matches the `*_id`
  twin of a resolved relation key (`destination_warehouse` →
  `destination_warehouse_id`), so the diff "Campo" uses the localized column
  label ("Almacén destino") instead of humanizing the key in English
  ("Destination Warehouse").
