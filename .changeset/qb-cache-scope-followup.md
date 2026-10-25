---
"@asteby/metacore-runtime-react": patch
"@asteby/metacore-starter-core": minor
---

Seguimiento de las cachés por alcance `org:user:lang`.

runtime-react: `DynamicTable` calcula la clave de arranque de las filas en caché con `peekCacheScope()` y una sola vez (antes llamaba a `cacheScope()` en cada render y, si el alcance había cambiado, disparaba oyentes que hacían `set` del store en pleno render: aviso «Cannot update a component while rendering»). La decodificación del JWT de `peekCacheScope` se memoiza por el texto del token (una entrada). La documentación de `setCacheScopeProvider` aclara que el proveedor debe cambiar con cada usuario y organización.

starter-core (seguridad): el almacén `metadata-cache` (persistido) y su prefetch de la barra lateral guardaban permisos sin dueño, que la siguiente cuenta del navegador veía. Ahora lleva el campo `scope` (`org:user:lang`, reutilizando `cacheScope`/`peekCacheScope`/`onCacheScopeChange` de runtime-react, que ya es dependencia), lee solo dentro del alcance vigente, escribe con el alcance capturado al pedir (`setMetadata`/`setModalMetadata` aceptan `{ scope }` y descartan la respuesta si la identidad cambió), `prefetchAll` no pide sin identidad ni guarda una respuesta de otra cuenta, y se vacía (memoria y almacenamiento persistido) al cambiar de alcance. Nueva `clearMetadataCache()` para el logout. La versión del persist sube a 4 y la migración descarta lo anterior.
