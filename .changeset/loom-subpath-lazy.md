---
"@asteby/metacore-runtime-react": minor
---

Peso del shell de los hosts federados (medido en OPS: 861.8 → 837.3 KB gzip, −24.5 KB):

- Nuevo subpath `@asteby/metacore-runtime-react/loom` con la implementación directa de Loom.
- El índice principal sigue exportando todo Loom (mismos nombres), pero `Seam`, `ProposalReview` y `SeamInspector` son envoltorios perezosos: la UI de los seams y el diff solo bajan cuando un seam tiene injertos o hay propuestas. `DynamicRecordDialog` usa solo el núcleo ligero (registro, proveedor, cola y regla de `apply`). Nuevo `useHasGrafts`.
- `SetupFlow`, `SetupFormStep`, `RecordsTable`, `HealthCard`, `StepStatusBadge`, `AddonConfigSurface` y `ConnectorBlocks` del índice principal pasan a ser envoltorios perezosos de `./setup` (≈85 KB minificado fuera del chunk compartido). Mismos nombres y props; el subpath `/setup` no cambia.
