---
"@asteby/metacore-runtime-react": patch
---

Al editar un registro, un valor que ya estaba guardado y no se modificó deja de re-validarse contra `validation` (regex, min, max, custom). Así un dato viejo que no cumple una regla agregada después (un RFC con guiones, un precio negativo) no bloquea el guardado de otros campos. Es el mismo criterio que aplica el kernel en `update`. Nuevo helper `exemptUnchangedRuleIssues` (LIVE-19).
