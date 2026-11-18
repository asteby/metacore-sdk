---
"@asteby/metacore-runtime-react": patch
---

Fix: `ConnectorCredentialFieldControl` (campos de credencial de `AddonConfigSurface`) ya no ejecuta su reset de estado al montar, solo cuando cambia el entorno (`resetKey`). Antes, un clic en «Rotar» o «Generar» que llegaba antes de que se vaciaran los efectos de montaje quedaba anulado por `setConfirmRotate(false)`/`setGenerated(false)`.
