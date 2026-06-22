---
"@asteby/metacore-runtime-react": patch
---

fix(line-items): non-select cells (number/text/date/switch/select/textarea) now honor a per-field `readonly` flag (set via PrefillSpec.lock), rendering disabled. Lets a receive-goods modal show read-only progress columns (ordered / already-received) alongside the editable qty.
