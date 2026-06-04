---
"@asteby/metacore-runtime-react": patch
---

fix(native-form): render rich widgets from column metadata (ref→searchable picker, image/upload→dropzone)

The native create/edit modal (`DynamicRecordDialog`, the one `CreateRecordDialog`
wraps and fetches `/metadata/modal/:model` for) only routed FK columns to its
searchable picker when they shipped a legacy `searchEndpoint` / `type: "search"`.
Now that the kernel serves a belongs_to column's `ref` (and an explicit
`widget`) on modal fields, a plain `ref` column degraded to a raw uuid text input.

`EditField` now honors:

- `field.ref` (or the snake_case `source`/`relation` aliases, or
  `widget: "dynamic_select"`) → renders `DynamicSelectField`: an async typeahead
  against `/api/options/<ref>?field=id` with option thumbnails when the remote
  rows carry an `image` (e.g. a brand logo). Static inline `options` still take
  the enum `<Select>` path — a `ref` column ships no inline options, so the FK
  branch never shadows a static enum.
- `widget: "upload"` (alongside the existing `type: "image"`) → the themed file
  dropzone, same control as the Brand logo.

Also fixes `deriveRelationFormFields` (the column→field mapper for
`DynamicRelation` inline child forms): it now carries `col.ref` through to the
field so a belongs_to column resolves to `dynamic_select`, and maps
`image`/`media-gallery` columns to media field types so they resolve to the
`upload` widget instead of a text input.
