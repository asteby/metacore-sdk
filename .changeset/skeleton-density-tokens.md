---
"@asteby/metacore-ui": minor
"@asteby/metacore-theme": minor
"@asteby/metacore-notifications": patch
"@asteby/metacore-inbox": patch
---

Skeletons por tokens y densidad: `Skeleton` toma el radio de `--skeleton-radius`; nuevos `SkeletonRow`/`SkeletonList` dimensionados por `--skeleton-row-h`, `--skeleton-avatar` y `--skeleton-line-h`, que se compactan con `data-ui-density='compact'` (tokens en `@asteby/metacore-theme`). El dropdown de notificaciones muestra filas esqueleto del tamano de la fila real en vez de texto; el esqueleto de `inbox` usa los mismos tokens.
