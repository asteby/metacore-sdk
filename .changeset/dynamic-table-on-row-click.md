---
"@asteby/metacore-runtime-react": minor
---

Add `onRowClick` prop to `DynamicTable` — when provided, each data row becomes clickable (cursor-pointer) and calls `onRowClick(row)` on click. Clicks on the checkbox (select column) and action buttons are stopped from propagating so they do not trigger the row handler. Behaviour is unchanged when the prop is not supplied.
