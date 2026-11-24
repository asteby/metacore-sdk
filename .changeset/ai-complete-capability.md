---
"@asteby/metacore-sdk": minor
"@asteby/metacore-runtime-react": minor
---

`ai.complete` para addons de frontend (kernel RFC 0007): `createAIClient(hostApi, addon)` en `@asteby/metacore-sdk` (tipos `AIRequest`/`AIResult`, estados `AI_STATUSES`, `AICompleteError` solo para `forbidden`/`invalid_input`, clave de idempotencia generada por llamada, `usage()` del addon) y el hook `useAI(addon)` en `@asteby/metacore-runtime-react` (`complete`, `loading`, `result`, `status`, `message`, `error`, `reset`). Sin Pulse, tope alcanzado, límite de tasa o host caído son resultados con `status`, nunca excepciones. Requiere un host con `POST /ai/complete` (OPS con kernel que traiga la capacidad).
