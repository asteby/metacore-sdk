---
"@asteby/metacore-runtime-react": minor
---

feat(runtime-react): metadata-driven DynamicRelations, DynamicRelation scope filters, and an upload field widget

Three additive primitives for generic detail pages and file-bearing actions
(kernel >= v0.41.0):

- **`DynamicRelations`** — a metadata-driven panel list. Given a parent record
  and `TableMetadata.relations[]` (the new `RelationMeta[]` the kernel serves),
  it renders one `DynamicRelation` panel per relation, merging each relation's
  static `scope` (polymorphic discriminators like `{ owner_model: "Customer" }`)
  plus `{ <foreign_key>: parentId }` into the panel's `filters`. This is what a
  generic detail page renders to show "a Customer's vehicles, addresses,
  attachments".
- **`DynamicRelation.filters`** — new optional `filters?: Record<string,string>`
  prop so a relation can be scoped by MORE than one column (the polymorphic
  case: `foreign_key=owner_id` AND `owner_model=Customer`). Each entry threads
  into the child list query as an additional `f_<col>=eq:<val>` param alongside
  the foreign-key filter, is hidden from the rendered child columns, and is
  folded into create/attach payloads so new children carry the scope.
- **`upload` field widget** — `type:"upload"` / `widget:"upload"` action fields
  now render a themed file picker (semantic tokens) that POSTs the file to the
  host upload endpoint as multipart and stores the returned file url/path as the
  field value. Honors `accept` and `maxSize` (tolerates kernel snake_case
  `max_size`/`storage_path`). Wired into BOTH the standalone `DynamicForm`
  renderer and the `ActionModalDispatcher` renderer so they stay in sync.

All purely additive — zero behavioural change for existing relations, forms, and
action modals.
