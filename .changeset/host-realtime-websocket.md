---
"@asteby/metacore-websocket": minor
---

Cliente realtime de eventos de datos: `createRealtimeClient` (ref-count de modelos, re-suscripción al reconectar, `resync` sintético tras reconexión o `DATA_EVENTS_DROPPED`), `createSocketTransport` (socket propio `wsUrl?channel=org:<id>&token=<jwt>` con backoff) y `transportFromHostSocket` (reusa el socket autenticado del host). Nuevo peer `@asteby/metacore-sdk` para los tipos del contrato.
