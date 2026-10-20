---
"@asteby/metacore-sdk": minor
"@asteby/metacore-runtime-react": minor
"@asteby/metacore-marketplace": minor
"@asteby/metacore-i18n": minor
---

Coherencia de cachés en el cliente. El backend mueve una época de caché cada vez que cambia algo de lo que se deriva la UI (addon instalado, actualizado, habilitado, deshabilitado o desinstalado; reinicio) y la anuncia en `X-Cache-Epoch` y en el mensaje WebSocket `CACHE_EPOCH_CHANGED`.

- `sdk`: `cache-epoch` (`observeCacheEpoch`, `onCacheEpochChange`, `wireCacheEpochPush`, `attachCacheEpoch`, `isStaleStateError`, `withStaleRetry`); `MarketplaceClient` reporta la época, revalida los GET (`cache: "no-cache"`) y reintenta una vez ante un plan desfasado (SQLSTATE 0A000/26000); `MetacoreProvider` revalida manifests y navegación al cambiar la época; hook `useCacheEpochPush`.
- `runtime-react`: `ApiProvider` reporta la época de cada respuesta y reintenta una vez ante estado desfasado; `useCacheEpochSync` vacía metadatos, lote de lecturas (incluidos metadatos/i18n) y opciones y marca react-query; `invalidateAddonQueries`.
- `marketplace`: el fetcher reporta la época y reintenta una vez; instalar/actualizar/desinstalar invalidan todo lo del addon (`invalidateAddon`), no solo el slice `marketplace`.
- `i18n`: `invalidateAddonI18n`; los bundles de addon se vuelven a pedir cuando cambia la época.
