---
'@asteby/metacore-ui': minor
'@asteby/metacore-runtime-react': minor
'@asteby/metacore-starter-core': patch
---

Sidebar nav: exact, view-aware active-state so sibling navs over the same model light up one at a time

The `NavGroup` active-state matcher (`checkIsActive`) now treats `view`/`group_by`
query params as the *identity* of a view-style nav item. Two navs over the same
model that differ only by their view — e.g. a "Board" (`?view=kanban&group_by=stage`)
and an "Issues" (`?view=list`, or a query-less default list) — are mutually
exclusive: only the item whose view identity equals `currentHref` stays active,
fixing the bug where both lit up at once.

- `@asteby/metacore-ui`: the matcher is extracted into a pure, React-free
  `layout/nav-active` module (`checkIsActive`, `splitHref`, `declaredFiltersMatch`,
  `VIEW_PARAMS`) and re-exported from `@asteby/metacore-ui/layout` for hosts and
  unit tests. `f_` filter and transient (page/sort/search) highlight behaviour is
  unchanged — a query-less link still highlights under filters/pagination, and
  per-status entries still light up one at a time.
- `@asteby/metacore-starter-core`: the scaffold's `nav-group` matcher gains the
  same view/query/filter-aware logic.
- `@asteby/metacore-runtime-react`: `DynamicView` now reads the active view from
  the per-nav signal — an explicit `view` prop (host router) or the `?view=`
  query — and prefers it over the model-level `metadata.view_type`, so the same
  model can route `?view=kanban` to `DynamicKanban` and `?view=list` to
  `DynamicTable` with no per-model metadata change. New pure helpers
  `readViewFromSearch` / `resolveActiveView` are exported.
