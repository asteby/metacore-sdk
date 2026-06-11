---
'@asteby/metacore-runtime-react': patch
---

ActivityDiff: drop noise rows from history diffs — raw FK keys (`created_by_id`) are hidden when their resolved sibling (`created_by: {name,…}`) is present in the same snapshot (covers before/after and the changes {from,to} shape), and `deleted_at` joins the meta-key filter alongside id/created_at/updated_at/organization_id.
