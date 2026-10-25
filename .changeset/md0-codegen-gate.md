---
"@asteby/metacore-sdk": patch
---

Tipos TS del contrato v3 regenerados desde el kernel (aparecen `card_role`, `read_permission`, `display_for`, `guides`, entre otros) y nuevo gate de CI `codegen` que falla si `packages/sdk/src/generated` no coincide con lo que genera tygo desde el kernel fijado en `go.mod`.
