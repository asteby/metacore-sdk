---
"@asteby/metacore-runtime-react": minor
---

Cliente HTTP único para addons federados: `createHostApiClient(hostApi)`, `useHostApiClient()` y `<HostApiProvider>`. Desenvuelve el envelope del kernel, unifica errores en `ApiError`, propaga abort y soporta blob y multipart; baseURL, token y headers (org/sucursal/idioma) los pone el host. `useHostApi()` también resuelve desde `HostApiProvider` (modales y pickers fuera de `AddonPageHost`) y falla con un error claro sin host.
