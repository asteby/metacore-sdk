---
'@asteby/metacore-agent-workspace': minor
---

`AgentWorkspaceProvider`: `storageNamespace` pasa a ser opcional; por defecto sale del `storage_namespace` de la marca de producto (`/api/brand`) y, sin marca, sigue siendo `ops` (compatible). El nombre y la mascota del asistente también toman por defecto los de la marca de producto cuando la organización no define los suyos. Nuevo peer `@asteby/metacore-sdk >= 3.18`.
