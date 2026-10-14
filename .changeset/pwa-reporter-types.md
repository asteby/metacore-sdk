---
"@asteby/metacore-pwa": patch
---

`attachConnectionReporter` acepta una `AxiosInstance` tal cual: el cliente es genérico en la respuesta y el rechazo se tipa como en axios (`any`). Exporta el tipo `ConnectionReporterClient`.

Nueva subruta `@asteby/metacore-pwa/connection` con el estado de conexión sin el provider (que importa `virtual:pwa-register/react`): el cliente HTTP puede usar `attachConnectionReporter` sin romper pruebas ni builds sin el plugin PWA.
