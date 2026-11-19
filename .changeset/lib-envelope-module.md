---
"@asteby/metacore-lib": minor
"@asteby/metacore-automations": patch
"@asteby/metacore-dataload": patch
"@asteby/metacore-org-ai": patch
"@asteby/metacore-billing": patch
"@asteby/metacore-runtime-react": patch
"@asteby/metacore-agent-workspace": patch
---

`@asteby/metacore-lib/envelope`: una sola implementación del envelope `{success,data,meta}` y de los mensajes de error. Nuevos `unwrapEnvelope(body)`, `unwrapResponse(res)`, `unwrapList(body)` / `unwrapListResponse(res)` (`items` + `meta.total`), `ApiError` / `isApiError`, `isEnvelope`, `getApiErrorMessage(err, fallback)` e `isAbortError`. Los `unwrap` locales de automations, dataload, org-ai, billing, runtime-react y agent-workspace usan ahora este módulo (agent-workspace sigue re-exportando `getApiErrorMessage`). CI rechaza `.data.data` nuevo (`scripts/check-no-data-data.mjs`, baseline ratcheteado).
