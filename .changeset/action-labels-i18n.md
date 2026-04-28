---
'@asteby/metacore-i18n': patch
'@asteby/metacore-runtime-react': patch
---

Fix raw i18n keys leaking into the auto-generated CRUD actions dropdown.

The auto-Actions column shipped in 7.1.0 looked up `datatable.view_record`, `datatable.edit` and `datatable.delete` — keys that didn't exist in `@asteby/metacore-i18n/locales`, so i18next fell back to the key string and the dropdown rendered "datatable.view_record" instead of "Ver".

Two fixes:
- `@asteby/metacore-i18n`: add `datatable.edit` and `datatable.delete` to the base ES/EN bundles (alongside the pre-existing `datatable.view`).
- `@asteby/metacore-runtime-react`: lookup `datatable.view` (the real key) and pass `{ defaultValue }` to every action label so a missing bundle never leaks the key into the UI.
