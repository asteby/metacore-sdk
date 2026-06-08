---
"@asteby/metacore-runtime-react": minor
---

Org-currency-aware money formatting in dynamic tables + the record dialog.

`<DynamicTable>` and `<DynamicRecordDialog>` now accept an optional `currency`
prop (the org's ISO-4217 code, e.g. `MXN`, threaded from org config like
`timeZone`). Money columns (`type:'number'` + `cellStyle:'currency'`) without an
explicit per-column currency now fall back to the org currency instead of
hardcoded `USD` — `resolveCurrency(col, orgCurrency)`. The record dialog, which
previously showed raw numbers, now formats money fields as a currency string in
the view renderer: a field is treated as money when the backend stamps
`cellStyle:'currency'`, or — as a robustness fallback mirroring the backend's
`inferDisplayCellStyle` — when it's numeric and its key matches the money
heuristic (`price`/`amount`/`total`/`cost`/`subtotal`/`balance`/`paid`, as the
whole key or a `_<m>`/`<m>_` affix). Editable inputs stay numeric.
