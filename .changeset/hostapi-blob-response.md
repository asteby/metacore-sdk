---
"@asteby/metacore-sdk": minor
"@asteby/metacore-runtime-react": minor
---

HostApi: `responseType: "blob"` request option. Federated pages can fetch PDFs and other binary documents (print tickets, download exports) through `useHostApi()` and get a `Blob` back, without reading tokens from `localStorage`. Error bodies of failed blob requests are decoded so `HostApiError.code`/`message` still work. Default (`"json"`) behavior is unchanged.
