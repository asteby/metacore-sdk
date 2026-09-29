---
"@asteby/metacore-runtime-react": minor
"@asteby/metacore-ui": minor
"@asteby/metacore-sdk": minor
---

Primer pintado estable del shell al recargar.

- runtime-react: `usePersistedQuery` y `createPersistedSnapshot`. Una query sembrada desde localStorage (versionada y con scope por org/usuario): el primer render ya tiene el último valor, se revalida una vez por carga en segundo plano y cada valor nuevo (refetch o `setQueryData`) se vuelve a guardar.
- ui: `resolveIconName` guarda los datos de cada glifo Lucide cargado y en la siguiente carga lo dibuja sin Suspense, sin pasar por el ícono de reserva. Los nombres con dígito (`Undo2`) resuelven a su glifo (`undo-2`). Las carpetas del sidebar que el usuario dejó abiertas siguen abiertas al recargar.
- sdk: `MetacoreProvider` acepta `cacheScope` y exporta `catalogCacheKey(scope)`, para que el catálogo persistido no se comparta entre orgs o usuarios del mismo origen.
