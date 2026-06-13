---
'@asteby/metacore-runtime-react': minor
---

Add the modular dashboard surface: `DashboardGrid` plus built-in widget
renderers (stat, bar, line, area, pie, donut, list, progress) and a federated
`kind:"custom"` path that renders through the `dashboard.widgets` slot inside the
same card chrome.

`DashboardGrid` renders the union of declarative + federated widgets in a
responsive 4-column grid, honouring per-widget `size`, grouping/ordering, batch
data loading with per-widget skeletons, isolated per-widget errors, a pro global
empty state, and permission gating via `useCan` (no provider / `isAdmin` ⇒
everything visible). Charts use recharts with theme CSS-var colors (dark-mode
safe); numbers reuse the org currency + locale formatting.

New exports: `DashboardGrid`, `normalizeGroups`, the widget renderers, the
`WidgetRenderer`/`WidgetSkeleton`/`WidgetCard`/`DeltaChip` primitives, the
`formatWidgetValue`/`accentClasses` helpers, and the types `WidgetKind`,
`WidgetSize`, `WidgetFormat`, `WidgetAccent`, `DashboardWidgetSpec`,
`DashboardWidgetQuery`, `WidgetData`, `WidgetSeriesPoint`,
`DashboardWidgetGroup`, `DashboardGridProps`, `DashboardGridStrings`,
`LoadWidgetData`. Adds `recharts` as a dependency.
