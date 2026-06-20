---
"@asteby/metacore-runtime-react": minor
---

feat(action-modal): line-items fields can prefill their rows from the acted-on record. A field whose `default` is a `PrefillSpec` (`{$prefillFromRecord, map, remaining}`) seeds one row per record array entry, copying mapped keys and computing a remaining quantity (`of - minus`), dropping fully-satisfied rows. Enables receive-goods/partial-reception modals (e.g. inventory transfers) to open pre-loaded with the pending lines instead of empty. Decoupled: the SDK only projects a record array into the field's item_fields.
