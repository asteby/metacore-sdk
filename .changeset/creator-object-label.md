---
"@asteby/metacore-runtime-react": patch
---

fix(runtime-react): no más [object Object] en celdas Creado por / Registrado por

Cuando el namePath apunta al sibling `created_by` (objeto), se usa objectLabel
(name) en lugar de String(object).
