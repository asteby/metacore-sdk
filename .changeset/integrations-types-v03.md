---
"@asteby/metacore-integrations": minor
---

Tipos v0.3 del contrato de ingesta: `IngestTarget` (+ `IngestTargetColumn|Permissions|Scope|Action|Stage`, espejo del `inbound.Target` del kernel), `ActionBlock` ampliado (`record.create|update|delete|action|transition|restore`, `guard`, `defaults`, `idempotency_field`, `max_rows`), `Condition` (`eq|ne|in|exists`) en `when` de cualquier bloque, `IntegrationsApi.listTargets?()` (`listModels` queda `@deprecated`), `parseIngestTargets`, `needsAdvanced`, `targetColumnsToMappingRows` e `inferSchema`. `record.delete` rechaza `mode: 'hard'`. Compatible hacia atrás: los cuatro bloques anteriores y el panel visual no cambian; los bloques nuevos se editan en la vista avanzada.
