---
"@asteby/metacore-runtime-react": patch
---

feat(action-modal): a field-action modal now renders the acted-on record's related-lists (model metadata.relations) below the form, as read-only context — e.g. the reception history of a transfer shown right inside the "Recibir" modal. Create actions (no record) render nothing; reuses the same DynamicRelations the detail view uses.
