---
"@asteby/metacore-runtime-react": minor
---

feat(dynamic-select): inline "+" to create the referenced record. A dynamic_select with a `ref` now shows a "+" button that opens the referenced model's OWN create modal (via a decoupled `metacore:create-record` window event the host handles) and auto-selects the newly created record. Lets users add a missing Category/Brand/etc. without leaving the form.
