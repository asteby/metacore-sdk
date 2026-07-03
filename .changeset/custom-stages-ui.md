---
'@asteby/metacore-runtime-react': minor
---

DynamicKanban: etapas personalizadas estilo Bitrix. Columna fantasma "+ Agregar etapa", diálogo de nombre/color/tipo y constructor de condiciones para etapas inteligentes (lanes virtuales por filtros, solo lectura), menú Editar/Eliminar en lanes custom con manejo de conflicto 409, e integración con las automatizaciones de etapa. No intrusivo: sin el endpoint `/custom-stages` la UI no se renderiza y el tablero queda intacto.
