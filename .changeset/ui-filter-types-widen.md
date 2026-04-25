---
'@asteby/metacore-ui': minor
---

Widen `ColumnFilterMeta` to cover every filter shape metacore apps use today.

- New `ColumnFilterType` export — canonical union for `filterType`, now
  including `'date_range'` (used by date-picker-backed columns in
  dynamic-table).
- New optional `filterSearchEndpoint` field — async server-driven option
  lookup for large option sets, consumed by the app's
  `/api/options/:model?field=` endpoint (as produced by
  `kernel/dynamic.Service.Options`).

Both additions are backwards compatible: existing `ColumnFilterMeta`
consumers keep compiling, the new variants are opt-in. Apps that were
widening the type locally (e.g. with
`ColumnFilterMeta & { filterSearchEndpoint?: string }`) can drop the
intersection.
