---
"@asteby/metacore-runtime-react": patch
---

Los selectores ya no muestran opciones viejas después de guardar. La caché de 30 s de options por columna se borra con cada escritura: las de `useApi()` y también las que el host hace con su propio axios (diálogos nativos, configuración). Además, el POST de lectura `/q` ya no cuenta como escritura, así que ya no borra lo que el lote recordó en cada lectura de options.
