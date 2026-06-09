---
'@asteby/metacore-runtime-react': minor
---

feat(dynamic-table): table footer totals — a declarative per-column SUM over the FILTERED set

A column opts into a footer total via its manifest `display_config.aggregate: "sum"` (mapped by the kernel to `styleConfig.aggregate` at runtime). `DynamicTable` now fetches those totals from a separate `${endpoint}/aggregate` endpoint that reuses the SAME filter/search params as the list (no sort, no pagination) — so the footer reflects the whole filtered set, not the visible page — and refetches whenever filters/search change.

`<TableFooter>` renders one cell per visible column: aggregate-flagged columns show the total formatted with the SAME helpers the body cells use (currency columns → org currency via `resolveCurrency` + `formatNumber`, number columns honour `styleConfig.decimals`), every other column gets an empty cell, and the first column carries a "Total" label. The footer only renders when at least one column opts in and totals are present.

New exports from `dynamic-columns`: `aggregateOf(col)` and `formatAggregateTotal(col, value, currency, locale)`.
