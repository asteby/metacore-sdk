---
"@asteby/metacore-sdk": minor
"@asteby/metacore-support-ui": minor
---

Alineado con la API de casos de OPS: `createSupportApi` expone paginación keyset (`listCases`, `getCase({before})`, `listMessages` con `X-Next-Cursor`), `reopen`, `channel` en `createCase` y `supportErrorCode` para los códigos `{error:{code}}`; el transporte devuelve `{ data, headers }`. `SupportThread` carga mensajes anteriores, reabre con `api.reopen` y mapea `support_disabled`, `forbidden`, `not_found`, `rate_limited` y `case_resolved` a estados de UI.
