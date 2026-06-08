---
"@asteby/metacore-runtime-react": minor
---

`DynamicRecordDialog` now refetches its own parent record after a child relation
row (line item, etc.) is created/updated/deleted, so server-recomputed
declarative rollups (sub_total, tax_amount, total) appear in place without a
manual page reload. Also exposes an optional `onChange` callback so hosts can
invalidate their own list/detail query underneath the dialog.
