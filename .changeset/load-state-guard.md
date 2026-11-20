---
"@asteby/metacore-ui": minor
"@asteby/metacore-runtime-react": minor
"@asteby/metacore-i18n": minor
---

Estados de carga que siempre resuelven: nuevo primitivo `<LoadState>` y hook `useLoadingGuard` (timeout configurable, error con boton de reintentar, `aria-busy`/`aria-live`, textos i18n `loadState.*` es/en). Usado en el esqueleto de `AppSidebar` (props `isError`/`onRetry`/`loadTimeoutMs`), `DashboardGrid` (`loadTimeoutMs`; un lote que falla ahora muestra error con reintento en vez de tarjetas vacias) y `DynamicTable` (`loadTimeoutMs`; metadata y lista).
