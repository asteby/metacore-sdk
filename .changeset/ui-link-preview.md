---
'@asteby/metacore-ui': minor
---

Vista previa de enlaces en `shared`: `LinkPreviewCard` (variantes `compact`/`row`/`rich`/`hero`, imagen lazy con aspect-ratio fijo, skeleton/blur, fallback favicon+dominio+inicial, fecha relativa con `<time>`, badges, tarjeta clicable accesible con enlace externo secundario), `FaviconAvatar`, `SourceBadge`, `MediaGrid` (feed responsivo en grid o lista) y los helpers `formatRelativeTime` y `domainFromUrl`. Solo tokens de tema; nunca hacen fetch a sitios externos: los metadatos vienen del backend y `resolveImageUrl` permite pasar las imágenes por un proxy propio.
