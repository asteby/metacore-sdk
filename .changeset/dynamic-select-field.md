---
"@asteby/metacore-runtime-react": minor
---

feat(runtime-react): add `dynamic_select` field widget — async searchable FK picker

Declarative answer to "I don't want to type a raw FK UUID". A field with
`type: "dynamic_select"` (or `widget: "dynamic_select"`) + `ref` renders a
typeahead combobox that queries the canonical options endpoint as the user
types (`GET /api/options/<ref>?field=id&q=<text>&limit=<n>`), reusing
`useOptionsResolver` (debounced, abortable). Works both as a flat form field
and as a line-items column cell (e.g. the account_id per debit/credit row of a
journal entry). The metacore equivalent of 7leguas' `type: search`, driven
entirely from the manifest — addons get a searchable picker with zero custom
React, keeping custom federated frontends for genuinely page-level UIs (POS).
