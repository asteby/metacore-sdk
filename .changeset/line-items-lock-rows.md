---
"@asteby/metacore-runtime-react": minor
"@asteby/metacore-sdk": minor
---

Nuevo flag declarativo `lock_rows` en campos de line-items (`type: "array"`): cuando está activo, el renderer fija las filas — oculta el botón "Agregar renglón" y los botones de borrar por fila, dejando solo editables las celdas de las filas ya presentes. Primitivo genérico del framework (se lee snake_case `lock_rows` con alias camelCase `lockRows`).
