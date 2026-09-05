---
"@asteby/metacore-runtime-react": minor
---

`DynamicTable` acepta la prop opcional `allowedActionKeys?: string[]`: un allowlist de acciones de fila (por `key` del manifest v3) a renderizar para ESA instancia de la tabla, en vez de todas las acciones que el modelo declara. Permite que dos vistas del mismo modelo (una tabla genérica y una pantalla de propósito específico, ej. una cola de aprobación de crédito) muestren distintas acciones sin tocar el manifest ni duplicar el modelo. `undefined` conserva el comportamiento actual (todas las acciones).
