---
'@asteby/metacore-runtime-react': patch
---

Resolve pro siblings in `DynamicRelation` line-item cells. The relation
sub-tables on a detail view (e.g. a sales order's lines) rendered raw values
where the parent table already renders nicely: a `*_id` FK showed the raw uuid,
a resolved relation/user object (`{ value, label }` / `created_by = { name }`)
was `JSON.stringify`'d, and the unset nil/zero UUID leaked as a string of zeros.

`formatCell` is replaced by the pure, tested `formatRelationCell(row, col)` (in
`dynamic-relation-helpers`) which: prefers the backend-resolved FK sibling keyed
by the column key with the trailing `_id` stripped (`product_id` → `row.product`),
shows a value-object's `label`/`name`/`title` instead of raw JSON, and maps the
nil UUID (via the shared `isNilUuid`) to the empty marker "—". Domain-agnostic —
benefits every addon that renders relation panels.
