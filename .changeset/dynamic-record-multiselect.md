---
"@asteby/metacore-runtime-react": patch
---

El multi-select declarativo (`field.multiple: true`, ver #881/#883) no se veía en el modal REAL de editar/crear registro (`dialogs/dynamic-record.tsx`, usado por la tabla genérica del host) — nunca se había cableado ahí, solo en `DynamicForm` (dynamic-form.tsx, usado por acciones). Además, `isLineItemsField` trataba CUALQUIER valor array (incluido el `[]` default de un campo `multiple` recién creado) como un documento de line-items y lo renderizaba "Solo lectura". Se agrega el branch de `DynamicMultiSelectField` antes del picker single-value y se excluye `field.multiple` de la heurística de line-items.
