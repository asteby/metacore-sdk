---
"@asteby/metacore-runtime-react": patch
---

DynamicTable: una celda `creator` sin actor resuelto (registro creado por el sistema, `created_by` null) muestra "Sistema" en vez de "N/A", consistente con el fallback del historial de actividad. `user`/`avatar`/`search` mantienen "N/A" (vacío = sin asignar).
