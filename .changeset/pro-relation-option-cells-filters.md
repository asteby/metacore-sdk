---
'@asteby/metacore-runtime-react': minor
'@asteby/metacore-ui': minor
---

Pro dynamic-table cells + relation/option multi-select filters

`DynamicTable` now renders resolved FK relations and option/type columns, and
filters them server-side — generically, for every declarative addon.

**Cells (`dynamic-columns.tsx`)**

- `relation` renderer: a column carrying a `ref` (belongs_to FK) or
  `cellStyle: 'relation'` renders the backend-resolved sibling
  `row[<key without _id>] = { value, label }` as a clean truncated chip
  (e.g. `category_id` → `row.category.label`). Falls back to the raw id, then
  to an empty marker. Mirrors how `created_by` ships as a `{ name, avatar }`
  sibling for the `creator` renderer.
- option/type badge: a `select`-style column shipping inline localized
  `options: [{ value, label, color, icon }]` renders the matched option's label
  as a colored `OptionBadge` (e.g. `product_type: "storable"` → the
  "Almacenable" badge), reusing the same badge path as `badge`/`status`.

**Filters (`dynamic-table.tsx` + `FilterableColumnHeader`)**

- New `dynamic_select` filter type: a `filterable` `ref` column loads its
  options from `searchEndpoint = /options/<ref>` (prefetched + cached into
  `filterOptionsMap`) and renders the same multi-value checkbox combobox as
  `select`. The backend's explicit `column.filterType` wins; otherwise it is
  inferred from the column shape.
- `select` and `dynamic_select` filters support MULTIPLE selected values
  (already Set-based in the header; the gate/active-count/loading states were
  generalized to cover `dynamic_select`).
