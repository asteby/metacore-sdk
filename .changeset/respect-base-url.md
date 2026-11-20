---
"@asteby/metacore-agent-workspace": minor
"@asteby/metacore-ui": minor
---

Las rutas fijas `/api/...` ya no ignoran el baseURL del host: el beacon de salida de llamadas y el atlas de mapas del workspace usan el cliente inyectado (`apiBaseUrl` opcional en el host, o `http.defaults.baseURL`), y `resolveTillImageUrl` acepta una base de media configurable. Sin cambios para quien no configure nada.
