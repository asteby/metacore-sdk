---
"@asteby/metacore-sdk": minor
---

Add `filter` to the `NavItem` type. A v3 nav entry may now declare a static
column→value filter (e.g. `{"status":"open"}`) so an addon can publish one
sidebar entry per status all pointing at the same model. Hosts read it to
deep-link each entry to a distinct, pre-filtered list URL (`?f_<col>=eq:<val>`),
which the SDK's `<DynamicTable>` applies on mount via `enableUrlSync`. The field
already exists in the kernel v3 contract and the navigation aggregator; this
catches the generated TypeScript types up so consumers can read it type-safely.
