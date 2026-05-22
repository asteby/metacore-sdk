---
'@asteby/metacore-runtime-react': minor
---

Add `CreateRecordDialog` and `ViewRecordDialog` to
`@asteby/metacore-runtime-react` (Wave 2.5 cleanup).

Both components are thin, intent-specific wrappers over the existing
`DynamicRecordDialog`. They surface a narrower, callback-driven API so
addons can mount create/edit/view dialogs without having to pre-select
a `mode` and without coupling to product-specific affordances:

- `CreateRecordDialog` — opens in create mode by default; passing
  `recordId` flips it to edit. Optional `onCreate` / `onUpdate`
  callbacks override the default `useApi()` POST/PUT calls, and
  `defaults` seeds the form on create.
- `ViewRecordDialog` — read-only viewer with optional `onEdit` /
  `onDelete` affordances (footer buttons are hidden when the callback
  is not provided).
- New shared types: `ModelKey`, `ModelSchema`, `RecordDialogProps`,
  `CreateRecordDialogProps`, `ViewRecordDialogProps`, `CreateResult`.

`DynamicRecordDialog` itself gains the same optional props
(`onCreate`, `onUpdate`, `defaults`, `schema`, `onEdit`, `onDelete`)
so existing consumers keep working unchanged. The product-specific
dialogs that used to live in `ops/frontend` (with pricing rules, media
galleries, category-driven custom attributes) are intentionally NOT
promoted to the SDK — those stay in the host as they are product
domain concerns. Generic record CRUD lives here.
