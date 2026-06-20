---
"@asteby/metacore-runtime-react": minor
---

feat(line-items): a PrefillSpec can `lock` item-field columns — locked dynamic_select cells render as a resolved, read-only NAME (eager option fetch, never the raw id) instead of an editable picker. Used for receive-goods/partial-reception lines whose product is dictated by the source document; the create flow (no prefill) stays fully editable.
