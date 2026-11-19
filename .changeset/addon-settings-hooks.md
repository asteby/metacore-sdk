---
"@asteby/metacore-runtime-react": minor
---

Ajustes de addon: un solo cargador. `useAddonSettings` ahora también devuelve `stored` (valores sin defaults), `definitions`, `overrides` y `reload()` (GET fresco que resuelve con el payload), y la URL pasa a `/addons/:key/settings` relativa al `baseURL` del cliente (antes `/api/addons/...`, que con `baseURL: '/api'` duplicaba el prefijo). Nuevo `useAddonInstalledProbe(key)`: «¿está instalado?» por la API de instalación (404 → false; sin provider), y con `InstalledAddonsProvider` responde del provider sin red. `SettingsBlock` y `AddonConfigSurface` usan el hook (misma petición y mismo contrato GET/PUT que antes; ahora requieren el `QueryClientProvider` del host, ya peer). Nota: `useAddonInstalled` (provider) ya existía.
