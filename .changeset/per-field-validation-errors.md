---
"@asteby/metacore-runtime-react": patch
---

Per-field validation error rendering + Spanish localization. On a 422 with a
`{ errors: { <field>: [{ code, params }] } }` map, create/edit dialogs and action
modals now show each field's first error inline (in red under the input) plus a
summary toast, instead of one flattened toast. Errors localize to Spanish from
locale-agnostic codes (`required`, `invalid_option`, `not_found`, `duplicate`,
`invalid_type`, generic fallback) using the field label via i18next `{{label}}`
interpolation, so hosts can override the copy under `validation.<code>`.
Pre-localized string entries pass through verbatim. Adds exported helpers
`extractFieldErrors` and `localizeFieldIssue` (with the `FieldIssue` type) in
`server-error`. The client-side required check now marks all missing fields
inline rather than toasting only the first.
