---
"@asteby/metacore-sdk": minor
---

Contrato realtime para addons: `RealtimeAPI` (`subscribe({models,events}, handler) → unsubscribe`, `status()`, `onStatus?`), `DataEvent` (frame `DATA_EVENT` org-scoped y sin valores de fila), `AddonHostContext` (shape del prop `host` de rutas inmersivas), `RealtimeInfo` (`GET /api/realtime/info`), constantes `REALTIME_MESSAGE` / `REALTIME_COMMAND` y `dataEventMatches`. `AddonAPI.realtime?` queda disponible para `register(api)`.
