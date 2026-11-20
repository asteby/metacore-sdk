---
"@asteby/metacore-starter-config": patch
---

`vite-preset.ts` (que consumen los hosts al tipar `vite.config.ts`) ya no falla con `Cannot find module '@tanstack/router-plugin/vite'` / `vite-plugin-pwa` cuando esos peers opcionales no estan instalados: los imports dinamicos se tipan localmente. Nuevo test que impide que los tipos publicados importen paquetes que no sean dependencias requeridas.
