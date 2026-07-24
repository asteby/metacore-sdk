---
"@asteby/metacore-runtime-react": patch
---

runtime-react: scope audit-column hiding in `DynamicRelation` to the view-modal line-subtable context

PR #659 started dropping audit/system columns (`created_by`, timestamps,
`organization_id`) and `visibility: "table"` columns in every one-to-many
`DynamicRelation` panel — including standalone detail pages
(`/m/<model>/<id>`, `m/invoices/<id>`), where those columns are useful. Add an
explicit `lineSubtable` prop (default `false`) that gates
`isColumnVisibleInLineSubtable`; outside that context the panel keeps the
previous behaviour and only hides the FK, scope and `hidden` columns. The view
modal (`DynamicRecordDialog`, action-modal dispatcher) opts in via
`<DynamicRelations lineSubtable>`.
