---
"@asteby/metacore-runtime-react": minor
---

`CollectionCell` renders resolved relation references as "pro" chips in EVERY
path — including the schema-less generic one.

Previously only the declared-`item_fields` path resolved a jsonb line-item ref
(e.g. `product_id`) to a relation chip. The generic path (used by the full-page
record detail and any jsonb without a declared schema) dumped the
backend-injected resolved sibling object as raw `"{…}"` AND showed the raw uuid
in a duplicate column. Now the generic path:

- detects the backend-injected `{ value, label, image }` ref siblings,
- renders them as the same relation chip (subtle tint + thumbnail or entity icon
  + name) the FK table columns use, and
- hides the raw `<key>_id` twin column,

so an unconfigured jsonb line-items blob reads as first-class relations
(foto/nombre) instead of uuid soup. The shared chip is extracted as `RefChip`
and reused by the schema (`ItemFieldCell`) and generic paths.
