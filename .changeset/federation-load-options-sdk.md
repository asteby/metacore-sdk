---
'@asteby/metacore-sdk': minor
---

`loadFederatedAddon(spec, addonKey?, version?, options?)` acepta `{ requireIntegrity, timeoutMs }`. `requireIntegrity` rechaza un remoto sin `frontend.integrity` (útil para addons privados); `timeoutMs` rechaza un remoto colgado y libera la caché para reintentar. Sin opciones el comportamiento es el de siempre. Exporta el tipo `LoadFederatedAddonOptions`.
