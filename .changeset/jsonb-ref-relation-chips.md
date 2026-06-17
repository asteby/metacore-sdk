---
"@asteby/metacore-runtime-react": minor
---

jsonb line-item `ref` cells render as relation chips (icon/photo + name).

In `CollectionCell` (table popover, inline detail view, and the read-only edit
field), a resolved ref sub-field — e.g. `product_id` inside a transfer's `items`
— now renders with the same "pro" relation look the FK table columns use: a
subtle deterministic tint, the resolved record's thumbnail (product photo / logo
/ avatar, resolved via the threaded `getImageUrl`) or a generic entity icon
fallback, and the resolved name — instead of a truncated uuid.

`CollectionCell` gains an optional `getImageUrl` prop, threaded from the columns
factory and from the record dialog's `ImageUrlContext`. Backend-agnostic: it
drives off the backend-injected `{ value, label, image }` sibling; an unresolved
ref still falls back to the scalar value.
