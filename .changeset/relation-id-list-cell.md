---
"@asteby/metacore-runtime-react": minor
---

Contraparte de lectura de `DynamicMultiSelectField`: una columna `ref` cuyo valor es un array jsonb de ids (campo declarado con `multiple: true` al escribir) ahora se renderiza como una lista de badges resueltos por id (`RelationIdListCell`) en vez de intentar leer el sibling `{value,label}` de una FK simple — antes ese caso caía sin manejar en `RelationCell` y mostraba vacío/roto.
