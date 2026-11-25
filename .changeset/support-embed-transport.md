---
"@asteby/metacore-sdk": minor
---

Nuevo `createEmbedTransport` en `@asteby/metacore-sdk/support`: sesion de embed de corta vida (apertura, renovacion al 80 % del TTL, reintento ante `session_expired`, token solo en la clausura), adaptacion de `createSupportApi` a la API del widget del Hub y tiempo real por SSE con `fetch`. Base, rutas, almacen del token de visitante y `fetch` se inyectan.
