---
"@asteby/metacore-runtime-react": minor
---

Org-timezone-aware date display in dynamic tables.

`formatDateCell` and the column factory (`defaultGetDynamicColumns` /
`makeDefaultGetDynamicColumns`) now accept an optional IANA `timeZone`, and
`DynamicTable` exposes a matching `timeZone` prop. When provided, datetime /
timestamp(tz) cells are rendered in that zone via the native
`Intl.DateTimeFormat` (instead of the viewer's browser zone), so instants no
longer day-shift; pure `date` columns are pinned to UTC so they never roll to
the previous/next day. Omitting `timeZone` preserves the exact legacy date-fns
formatting (fully backward-compatible).
