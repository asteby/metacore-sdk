---
'@asteby/metacore-runtime-react': patch
---

Auto-derive `date_range` filter for `type: 'date'` columns.

The zero-config filter chip in 7.1.0 picked the right variant for text/number/boolean/select but mapped `type: 'date'` to a generic text filter. `FilterableColumnHeader` already supports `date_range` — pointing the auto-derive at it makes any column flagged `filterable: true` with `type: 'date'` light up the calendar range picker without app-side glue.
