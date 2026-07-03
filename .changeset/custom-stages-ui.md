---
'@asteby/metacore-runtime-react': minor
---

DynamicKanban: etapas personalizadas estilo Bitrix. Columna fantasma "+ Agregar etapa", diálogo de nombre/color/tipo y constructor de condiciones para etapas inteligentes (lanes virtuales por filtros, solo lectura), menú Editar/Eliminar en lanes custom, e integración con las automatizaciones de etapa. No intrusivo: sin el endpoint `/custom-stages` la UI no se renderiza y el tablero queda intacto.

Alineado al contrato del backend (ops #704): las lanes se pintan desde la metadata (`stages[]` con `custom: true` y `smart_lanes[]`), con el CRUD `/custom-stages` como fuente del diálogo de gestión. Los filtros de las etapas inteligentes se serializan como `f_<field>=OP:valor` (`EQ`, `NEQ`, `HAS` para membresía en arrays jsonb, `IN` para listas). En edición, `model`/`type`/`key` son inmutables. El borrado de una etapa real con tarjetas responde 409 con `meta.cards`; el diálogo muestra el conteo y ofrece reasignar las tarjetas a otra columna vía `?reassign_to=<key>`.
