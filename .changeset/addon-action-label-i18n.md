---
"@asteby/metacore-runtime-react": patch
---

fix(runtime-react): translate addon action labels at render (toolbar + modal)

`ModelActionToolbar` and `ActionModalDispatcher` rendered an action's `label`
(and each field's `label`) verbatim. For an addon's custom action these are i18n
keys (e.g. `integration_github.action.create_issue.label`) whose locale bundle
loads asynchronously, so the create button, the modal title/submit, and the
field labels showed the raw key — and never re-derived once the bundle landed.
They now translate at render with `t(label, { defaultValue: label })`, so the
label resolves the moment the addon i18n arrives (via the i18next store `added`
event) and an already-localized string passes through unchanged.
