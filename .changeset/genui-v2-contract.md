---
"@asteby/metacore-genui": minor
---

Contrato `genui/v2` (ADR 0001 del SDK, PR 4): JSON Schema versionado (`schema/genui-v2.schema.json`) como fuente única, tipos TS y tablas de bloques generados (`pnpm codegen`), vectores de conformidad compartidos con el kernel (`conformance/`) y validador ampliado. Nuevas exportaciones: `parseUISpecV2`, `parseGenUI` (acepta v1 y v2 y devuelve v2), `upgradeV1`, `downgrade`, `GENUI_V2_LIMITS` (profundidad 6, 200 bloques, 128 KB), `GENUI_ERROR_CODES` y `GenUIError`. Aditivo: sin renderizadores nuevos; `parseUISpec` y `GenerativeUI` (v1) no cambian.
