---
"@asteby/metacore-dataload": minor
---

Cliente alineado con el contrato real de OPS (`/api/dataload`):

- `listProfiles()` devuelve `ProfileSummary[]` (versiones del catálogo base compartido y de la organización); `profileVersion()` trae una versión completa; `saveProfile` se reemplaza por `publishVersion()` (las versiones son inmutables: misma huella = no-op, otra = 409). El lanzador referencia perfiles como `nombre@versión` / `base/nombre@versión` (`profileRef`) y ya no truena con la respuesta de OPS.
- `runPlan(id, { action, offset, limit })` devuelve `PlanPage` paginado en el servidor; `reviews()` devuelve `ReviewPage` (`items`, `counts`, `next`) y `listAllReviews()` sigue el cursor.
- La ejecución aplica exactamente lo simulado: `expectPlanHash`, la versión resuelta por el dry-run (`run.registry`) y `source: { id }` (la fuente ya guardada; no se vuelve a subir). Ante el 409 de plan cambiado (`isPlanChanged`) el lanzador descarta el plan y pide simular de nuevo (`planChanged`).
- Tipos al día con el kernel: `duplicates`, `maxStreamRows`, `progress.superseded`, `run.registry`, `ReviewEntry.baseHash`, estado `applying`, `ManifestEntry.validatedAt/revisions`, `MediaJob.revalidate/outcome`.
- Prueba de contrato contra respuestas reales del handler de OPS (`src/__fixtures__/ops`).

Cambio incompatible: `saveProfile`/`StoredProfile` se retiran; `runPlan` y `reviews` devuelven páginas.
