---
"@asteby/metacore-runtime-react": minor
---

Relation (one_to_many) cells now show the FK product image: when an FK column's backend-resolved sibling carries an `image`, the relation row renders a thumbnail + label instead of plain text. The nested line-item edit form drops server-managed/audit columns (`id`, `created_at`, `updated_at`, `deleted_at`, `created_by(_id)`, `updated_by(_id)`) so they no longer render as `[object Object]` inputs, and the nested `dynamic_select` is seeded with the existing value's label/image from the initial record so the trigger shows the name + thumbnail instead of a raw UUID. The image-url resolver context moved to its own `image-url-context` module to avoid a circular import.
