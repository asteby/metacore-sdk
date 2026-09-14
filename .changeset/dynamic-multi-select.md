---
"@asteby/metacore-runtime-react": minor
---

Agrega `DynamicMultiSelectField` (widget `dynamic_multi_select`): un campo declarativo `ref`/`source`/`relation` con `field.multiple: true` ahora renderiza un picker multi-select (chips + búsqueda) en vez del `dynamic_select` de valor único, y guarda el valor como array plano de ids. Pensado para relaciones legítimamente many-to-many desde un solo formulario (p. ej. una lista de precios que aplica a varios segmentos de cliente a la vez) — la columna que lo respalda debe ser un tipo jsonb del kernel (dynamic/coltypes.go), sin requerir ningún cambio en el kernel.
