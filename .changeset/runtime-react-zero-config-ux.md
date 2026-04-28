---
'@asteby/metacore-runtime-react': minor
---

Zero-config CRUD UX from a single column flag.

Three changes that move polish from each app's metadata into the SDK default behaviour, so a model only needs `enableCRUDActions: true` plus `filterable: true` on the columns it wants searchable to get the same UX link / ops / hub render today:

1. **Auto-derive filter chip type from column type.** A column flagged `filterable: true` without options or a `searchEndpoint` no longer falls back to "no filter" — it picks the FilterableColumnHeader variant that matches the column type: `text` for text/email/phone/tags, `number_range` for numeric columns, `boolean` for booleans, `select` when options/endpoint are present.
2. **Auto-render the row Actions column when `enableCRUDActions` is on.** If the host metadata already declares its own `actions[]`, those win. When it doesn't, the SDK falls back to the canonical View / Edit / Delete trio wired to DynamicTable's existing `view` / `edit` / `delete` handlers — no host-side glue.
3. **`<DynamicCRUDPage>` defaults `hideRefresh` to `true`.** The page-level Refresh button duplicated the one DynamicTable's internal toolbar already ships next to "View"; the page chrome now defers to it. Apps that want both back can pass `hideRefresh={false}`.
