---
"@asteby/metacore-lib": minor
"@asteby/metacore-auth": minor
---

Respuestas HTML en endpoints de API ya no llegan como mensaje. `@asteby/metacore-lib/http-errors` agrega `HtmlResponseError` (mensaje humano, `details()` colapsable, `correlationId`), `detectHtmlResponse` y `looksLikeHtml`; `handleServerError` nunca devuelve una página HTML como mensaje. `createApiClient` rechaza con `HtmlResponseError` cuando la respuesta es HTML (catch-all de una SPA, página de error de un proxy) o cuando un JSON trae una página HTML en `message`; `htmlErrorMessage` permite localizar el texto y `responseType: 'text'` lo desactiva por petición.
