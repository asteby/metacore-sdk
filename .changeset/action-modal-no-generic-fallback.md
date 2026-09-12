---
"@asteby/metacore-runtime-react": patch
---

Fail closed when an action declares `modal` but no federated component is registered — never fall back to the generic confirm dialog.
