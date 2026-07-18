---
"@asteby/metacore-runtime-react": patch
---

Fix FK violation (SQLSTATE 23503) when creating/updating a record with an empty optional relation. DynamicRecordDialog now normalizes the submit payload so empty reference pickers (and any nil-UUID value) are sent as `null` instead of `""`/"00000000-…", which a nullable FK column (e.g. products.category_id) would otherwise reject. Generic across all addons — keyed off field metadata (ref / dynamic_select / search). Exposed as `normalizeRefFieldsForSubmit`.
