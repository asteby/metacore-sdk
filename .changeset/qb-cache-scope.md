---
"@asteby/metacore-runtime-react": minor
---

Seguridad: las cachés del cliente (almacén de metadata persistido y cachés del lote `/q`) ahora se llavean por el alcance `org:user:lang` (`cacheScope()`); si falta la organización, el usuario o el idioma no se sirve ni se guarda nada. Al cambiar de alcance (logout, otra organización, otro usuario u otro idioma) se vacían las cachés en memoria y la persistida. Nuevas funciones para el host en logout: `clearQueryBatchCaches()` y `clearMetadataCache()`; además `syncCacheScope()` y `setCacheScopeLanguageProvider()` (el idioma sale de `i18nextLng` o `<html lang>`). El almacén `metacore-metadata-cache` sube a v6 y descarta lo anterior. El lote tolera un `status` por parte (403 prohibido, 424 rechaza, 5xx/413 un reintento por GET directo); sin `status` conserva la heurística por mensaje.
