---
"@asteby/metacore-starter-core": patch
---

fix(starter-core): leer backend URL de globalThis en runtime, no de
import.meta.env. La 4.0.0 tenía `http://localhost:8080` baked in del
build de la lib (Vite inline `import.meta.env` durante el build de la
lib, no de la app que la consume), rompiendo `getStorageUrl` y
`getImageUrl` en cualquier app de prod — los logos del sidebar y
avatares apuntaban a localhost del visitante. Ahora ambas funciones
leen `globalThis.__METACORE_BACKEND_URL__`, que la app consumidora
setea en su entry point antes de cualquier import del SDK:

```ts
;(globalThis as any).__METACORE_BACKEND_URL__ = import.meta.env.VITE_BACKEND_URL
```

Funciona idénticamente en Vite, Next.js y cualquier runtime del
navegador.
