---
"@asteby/metacore-runtime-react": minor
---

Loom (RFC 0005 del kernel), sistema de contribuciones de UI, aditivo:

- `<Seam>`, `useSeam`, `registerGraft`, `registerPart`, `LoomProvider` (injertos autorizados por el servidor, flags, ajustes, telemetría, inspector `inspect`).
- `resolveSeam` puro: orden, condiciones `when` (permiso, flag, ajuste, modelo, modo), `requires` semver del contrato y lista del servidor; explica cada descarte.
- Lentes con clase de datos: el injerto solo recibe las lentes de `reads`, copiadas y congeladas; los errores de injertos que leen `pii*`/`secret` salen redactados.
- Propuestas: `propose` atenuado a `writes ∩ writable`, `useProposalQueue` y `<ProposalReview>` (diff antes/después, aplicar, descartar, deshacer).
- `applyOverlays`: fusión pura y determinista de capas (preset < org < sucursal < rol < usuario) sobre un grafo de bloques, capas atómicas, versión de base y procedencia.
- `DynamicRecordDialog` publica los seams `record.dialog.header` y `record.form.section`, y acepta `onIntent` e `initialProposal`; `CreateRecordDialog` los pasa. `useRecordPickerDialog` atiende `record.select` (`onSelectExisting`) y `record.edit`; `CustomerPicker` convierte `record.select` en selección.
