---
"@asteby/metacore-integrations": minor
---

Entradas: `TargetPicker` accesible (addon -> modelo, buscable, teclado completo, destinos sin permiso deshabilitados con el motivo) y `MappingEditor direction="in"`: una fila por columna escribible del destino, `match` solo entre `match_candidates`, autosugerencia visible (nunca aplicada sola), obligatorias sin mapear bloquean el guardado y vista previa del registro con un evento de ejemplo (JSON pegado o del contrato). `ActionChain` usa el picker cuando el host provee `listTargets`; sin `listTargets` conserva `listModels`/texto libre. Nuevos helpers: `groupTargets`, `targetBlockedReason`, `suggestSource`, `validateRecord`, `unmappedRequired`, `inboundProblems`, `EDITABLE_WHEN_OPERATORS` (el editor de `when` no expone `exists`: OPS acepta `eq|ne|in`). i18n es/en completo.
