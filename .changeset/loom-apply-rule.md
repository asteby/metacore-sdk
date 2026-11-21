---
"@asteby/metacore-runtime-react": minor
"@asteby/metacore-sdk": minor
---

Loom: regla de `apply: 'auto'` (RFC 0005). Una propuesta solo se aplica directa (con «Deshacer») si la Part declara su propio paso de revisión (`PartDef.selfReview` / `GraftDef.selfReview`) y ningún campo del parche es de clase `secret` (`SeamContract.fieldClasses`; `DynamicRecordDialog` marca `type/widget: password` y `data_class: secret`). En cualquier otro caso se baja a diff revisable, también para el parche que viaja en la intención `record.edit`. `effectiveApply` exportado.

`registerRecordPrefill` queda en desuso (aviso una vez por sesión): usar `registerGraft` en el seam `record.dialog.header`. Sigue funcionando dos versiones menores con el aviso y después queda como adaptador permanente.
