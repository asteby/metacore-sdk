---
'@asteby/metacore-runtime-react': minor
'@asteby/metacore-sdk': minor
---

`timeout` por llamada y `defaultTimeout` en el cliente HTTP del host (validado, topado por `createHostApi({ maxTimeoutMs })`, 10 min por defecto), y `freshness: 'network'` para lecturas que no deben salir del caché offline (el host debe leer `metacoreFreshness`). `HostApiRequestOptions` y `HostRequestConfig` coherentes; `PROTECTED_HOST_HEADERS` sin cambios.
