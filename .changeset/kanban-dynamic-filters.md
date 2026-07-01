---
'@asteby/metacore-runtime-react': minor
'@asteby/metacore-ui': minor
---

feat(kanban): dynamic column filters on DynamicKanban

The board now filters like its DynamicTable sibling. A filter bar above the
lanes exposes a global search box plus one chip per filterable field (from
`metadata.filters[]` and every `filterable` column), driving the SAME
server-side `f_<key>=<op>:<value>` / `search` params — so a model's table and
kanban views filter identically.

- **ui**: extracted the per-column filter popover into a new, TanStack-agnostic
  `ColumnFilterControl` (select/boolean/dynamic_select/text/number_range/
  date_range). `FilterableColumnHeader` now delegates its filter UI to it
  (behavior unchanged); it also powers the kanban's labeled filter chips.
- **runtime-react**: new `useDynamicFilters(metadata)` hook owning the filter
  state, option prefetch, config derivation and param serialization (factored
  out of DynamicTable's inline logic). `DynamicKanban` consumes it and gains a
  `defaultFilters` prop for parity with DynamicTable.
