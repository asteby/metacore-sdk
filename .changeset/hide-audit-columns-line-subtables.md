---
"@asteby/metacore-runtime-react": patch
---

Ocultar columnas de auditoría/redundantes en las sub-tablas de líneas del modal de vista.

Las sub-tablas de relaciones (`DynamicRelation` one_to_many — "Líneas del pedido", etc.) ahora respetan la `visibility` de cada columna con criterio de modal: una columna declarada `visibility: "table"` (o `"list"`) NO aparece en la sub-tabla del modal, aunque siga visible en la tabla principal `/m/<model>`. Además, las columnas de auditoría (`created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`, `organization_id`) se ocultan por defecto en ese contexto por ser ruido bajo el registro padre; un manifest puede volver a mostrarlas declarando una `visibility` explícita (`"all"`/`"modal"`) en la columna.

Nuevos helpers exportados: `isColumnVisibleInModal`, `isColumnVisibleInLineSubtable` y `AUDIT_SUBTABLE_COLUMN_KEYS`.
