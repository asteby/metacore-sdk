---
"@asteby/metacore-runtime-react": minor
---

Action modal: `PrefillSpec.fromField` — a line-items grid can be seeded from the document picked in a sibling ref field. A `create`-placed action (no record) such as «Recibir OC» now fills its rows as soon as the user selects the purchase order: `$prefillFromRecord` names a one_to_many relation of the referenced model, `map`/`remaining`/`lock` work as in row actions, and clearing the selection empties the grid. Exports `prefillFromFieldRequests` and `prefillFromFieldRelationRequest`.
