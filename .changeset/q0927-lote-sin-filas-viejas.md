---
"@asteby/metacore-runtime-react": patch
---

El lote /api/q ya no sirve filas viejas: las listas, registros y options siempre consultan al servidor (reutilizan solo con etag de contenido `qh-`), toda mutación de useApi olvida lo recordado, y el recorte por `in:` guarda todas las filas de cada id, lee `f_<campo>` por su columna y no toca listas paginadas.
