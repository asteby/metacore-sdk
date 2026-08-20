---
"@asteby/metacore-runtime-react": patch
---

Export PrefillSpec helpers (`isPrefillSpec`, `buildPrefillRows`, `applyPrefillLock`)
so addons can unit-test `$prefillFromRecord` without reaching into private
dispatcher internals. Kernel now types the same shape in the v3 schema.
