---
"@asteby/metacore-runtime-react": minor
---

Relaciones hijas `create_inline` al crear: el modal de registro (`DynamicRecordDialog`, modo crear) pinta una tabla editable de filas borrador por cada relación con `create_inline: true` y las envía con el padre en una sola llamada (`_children.<relación>`). `RelationMeta` gana `create_inline?` y `min?`; el 422 `_children.<relación>.<i>.<campo>` se pinta en la celda y `min` bloquea el envío. Sin relaciones inline el cuerpo no cambia. Núcleo común de filas borrador (`draft-rows`) compartido con el editor de partidas de documento.
