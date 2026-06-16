---
"@asteby/metacore-runtime-react": minor
---

CollectionCell renders jsonb line-items from a declared sub-field schema when
the column carries one (`col.itemFields` / snake `col.item_fields`, kernel v3
`item_fields`). Headers use the schema's already-localized `label` verbatim (in
the declared order, no prettify/translate); `ref` columns resolve to the
backend-injected sibling label — the FK key without `_id` (`product_id` →
`product`), else `<key>_label` — showing the resolved name instead of the raw
uuid (`{ value, label }` → `label`, bare string → itself, missing → truncated
uuid fallback). The badge count noun stays locale-aware. When no schema is
present the generic dict/prettify behaviour is unchanged. `itemFields` is
threaded from the dynamic columns factory callsite.
