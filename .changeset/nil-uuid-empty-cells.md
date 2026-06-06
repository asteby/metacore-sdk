---
'@asteby/metacore-runtime-react': patch
---

Render the nil UUID (`00000000-0000-0000-0000-000000000000`) as empty in
dynamic tables and the detail view.

A nullable FK that a backend serializes as the all-zeros UUID instead of `null`
used to leak into cells and read-only fields as a long string of zeros. The
table cell renderer (`defaultGetDynamicColumns`) and the record detail view
(`DynamicRecordDialog`/`ViewRecordDialog`) now treat the nil UUID as "no value",
falling through to their existing empty markers (`-` / `—`). This covers
relation/ref chips, `creator`/`url`/`status`/`dynamic_select` and any generic
UUID-bearing column. A new shared guard (`NIL_UUID`, `isNilUuid`,
`normalizeNilUuid`) is exported for hosts that render values themselves.
