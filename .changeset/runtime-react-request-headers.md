---
'@asteby/metacore-runtime-react': minor
'@asteby/metacore-sdk': minor
'@asteby/metacore-genui': patch
'@asteby/metacore-ui': patch
---

`createHostApiClient(api, { defaultHeaders })`, `useHostApiClient({ defaultHeaders })` y `headers` por llamada (`X-Correlation-ID`...), aditivo. El host descarta las cabeceras que posee (Authorization, X-Organization-ID, X-Branch-ID, Accept-Language, Cookie...; `PROTECTED_HOST_HEADERS`). `HostApiRequestOptions.headers` en sdk. Ademas sdk, genui, ui y runtime-react reescriben en postbuild sus imports relativos de `dist/` con extension (`.js`) para que Node ESM los resuelva.
