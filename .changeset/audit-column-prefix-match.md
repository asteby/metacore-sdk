---
'@asteby/metacore-runtime-react': patch
---

Las columnas de auditoría resueltas como relación (created_by servido como
`created_by.avatar`) ahora también se ocultan en las sub-tablas del modal: el
filtro matchea la clave base y sus proyecciones `<key>.<subcampo>`, no solo el
match exacto.
