---
"@asteby/metacore-runtime-react": minor
"@asteby/metacore-ui": patch
---

feat(dynamic-form,nav): FK→searchable picker, image thumbnails, media→upload, query-aware nav

- **resolveWidget**: a field that declares an FK target (`ref`, or the
  snake_case `source`/`relation` the kernel may serve) now resolves to
  `dynamic_select` BEFORE the type switch, so any declared relation renders a
  searchable picker instead of a raw text input — regardless of the column's
  SQL type. `image`/`media`/`file` types resolve to the `upload` widget.
- **DynamicSelectField**: renders the option's `image` as a small thumbnail in
  the trigger (selected option) and in each dropdown row, with a neutral
  placeholder fallback. Thumbnails only appear when the resolved options carry
  images, so image-less relations keep their plain text list. Also tolerates
  the `source`/`relation` ref aliases for option resolution and inline-create.
- **NavGroup.checkIsActive**: now query-aware. Order-status style items that
  share a path but differ only by a query param (`?status=reception` vs
  `?status=delivery`) light up one at a time instead of all together; an item
  that declares query params must match the current href's query exactly
  (after normalization, with transient `f_` filter params stripped), while
  query-less links keep matching on path alone.
