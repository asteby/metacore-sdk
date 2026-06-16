---
'@asteby/metacore-runtime-react': minor
---

Add a generic `CollectionCell` renderer for jsonb / array / object table-cell values.

Previously the `default:` branch of `defaultGetDynamicColumns` rendered such
values as raw `JSON.stringify(value)`, which was unreadable. Every jsonb column
now renders a compact, brand-neutral, dark-mode-friendly cell with no per-addon
config:

- **Array of objects** (e.g. line items): a count Badge (`2 ítems`) that opens a
  Popover mini-table — columns are the prettified union of row keys, cells go
  through a shared `formatScalar` (uuid/long strings truncated, booleans as
  ✓/✗, nested shapes summarized).
- **Array of scalars**: first few joined inline with a `+N` overflow, full list
  in the popover.
- **Plain object**: first few `key: value` pairs inline, all pairs in the popover.
- **null / empty**: muted `-`.
- JSON-string values are defensively parsed; unparseable strings are truncated.

Exports `CollectionCell`, `formatScalar`, `prettifyKey`, and `CollectionCellProps`.
