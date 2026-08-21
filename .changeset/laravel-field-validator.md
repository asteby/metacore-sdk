---
"@asteby/metacore-runtime-react": minor
---

Laravel-style field validator: localize 422 `{errors:{field:[{code,params}]}}`
into the operator's language (es/en catalogs, overridable via `validation.*`),
map keys to translated labels, and pre-flight the same regex/min/max/custom
rules the kernel enforces — no more generic "validation failed" / `[object Object]`.
