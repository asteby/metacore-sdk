---
'@asteby/metacore-ui': patch
'@asteby/metacore-starter-core': patch
---

Data-table filter polish:

- The selected-option checkbox in the column filter dropdown now uses the
  contrast-guaranteed `foreground`/`background` pair, so the checkmark stays
  legible in dark mode even when a brand's `primary`/`primary-foreground` pair
  collapses to dark-on-dark.
- `FilterableColumnHeader` (`@asteby/metacore-ui`) gains the `date_range`
  filter: a compact range calendar for date/datetime columns (react-day-picker,
  already a dependency), emitting a `"YYYY-MM-DD_YYYY-MM-DD"` value.
