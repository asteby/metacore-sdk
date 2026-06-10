---
"@asteby/metacore-runtime-react": minor
---

Add Activity / Time Machine components: `ActivityDiff`, `RecordHistory`, and
`ActivityTimeline`.

- `ActivityDiff` — renders the field-level diff of a single `ActivityEvent`
  (created/updated/deleted states, before→after per field, toggle all/changed).
- `RecordHistory` — chronological timeline of all events for a single record,
  collapsible cards, embeddable in a record dialog "Historial" tab.
- `ActivityTimeline` — global feed grouped by `correlation_id`, with client-side
  filters (model, actor, action, date range) and injectable `resolveColumns(model)`
  resolver so hosts supply metadata without any internal fetch.

All three components are transport-agnostic (no fetch, no API calls) and reuse
the existing display-type renderers (currency, status, date, boolean, relation
chips, tags, color, url) via the new `ActivityValueRenderer` helper, keeping
table cells and diff cells visually consistent.

Also exports `ActivityValueRenderer` as a standalone pure renderer for use
outside the activity components.
