---
"@asteby/metacore-pwa": minor
---

Estado de conexión profesional: `OfflineIndicator` pasa a ser una pastilla discreta que avisa «Sin internet», «Sin conexión con el servidor» (solo si la caída dura más de 6 s, comprobada en silencio con reintentos espaciados) y «Conexión restablecida». Los fallos con la pestaña oculta o recién recuperada no cuentan. Nuevos `attachConnectionReporter(api)`, `onConnectionRestored(cb)`, `configureConnectionProbe`, `useConnectionState`, `reportNetworkError` y `reportReachable`. `PWAProvider` acepta `connectionToasts={false}` para no duplicar avisos.
