---
"@asteby/metacore-runtime-react": minor
---

CollectionCell is now locale-aware: jsonb/array popover headers and the item
count noun render in the org's language. Resolution per key: host `t(rawKey)`
override → built-in es/en dictionary of common data/commerce keys (product_id,
quantity, price, total, name, sku, …) → snake→Title prettify fallback. Count
noun localizes (es: ítem/ítems). Locale + translator are threaded from the
dynamic columns factory; defaults to English when absent.
