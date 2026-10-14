---
'@asteby/metacore-pwa': minor
---

`PWAProvider` acepta `offlineReadyToast` (`false` silencia el aviso «App lista para funcionar sin conexión»; una función lo sustituye). `PWAUpdatePrompt` acepta `enabled` (desactiva el toast de actualización) y `renderToast` (presentación propia con textos, duración y acciones `update`/`dismiss`; se sigue retirando con `toastId` mientras hay un modal abierto).
