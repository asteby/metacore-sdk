---
"@asteby/metacore-pwa": minor
---

`PWAInstallPrompt`, `PWAUpdatePrompt` y `NotificationPermissionPrompt` ahora se
renderizan a través del toast unificado de `@asteby/metacore-notifications`
(misma tarjeta que la campana/WS/SSE, con soporte nativo de botones de
acción/cancelar) en lugar de un banner fijo propio. Esto evita que varios
banners (permiso de notificaciones, actualización disponible, instalar app)
se amontonen en distintas esquinas de la pantalla al mismo tiempo.

Breaking: se eliminaron las props `ButtonComponent` y `className` de
`InstallPromptProps` y `UpdatePromptProps` (el estilo del botón ahora lo
define el toast unificado, no el host). Usa `messages` para personalizar los
textos.
