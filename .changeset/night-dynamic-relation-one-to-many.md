---
"@asteby/metacore-runtime-react": minor
---

feat(runtime-react): nuevo `<DynamicRelation kind="one_to_many">` — lista inline editable que cuelga del registro padre.

API mínima:

```tsx
<DynamicRelation
    kind="one_to_many"
    model="line_items"
    foreignKey="invoice_id"
    parentId={id}
/>
```

- Lista filas del modelo hijo filtradas por `f_<foreignKey>=eq:<parentId>` (envelope kernel `{success, data, meta}`).
- Crear/Editar via `<DynamicForm>` derivado del `TableMetadata.columns` del modelo; la FK queda fija al `parentId` y se oculta automáticamente del form y de la lista.
- Quitar via `DELETE /data/<model>/<id>` con confirm dialog.
- Permisos por prop (`canCreate` / `canEdit` / `canDelete` — default `true`) y strings traducibles via prop `strings`.
- Helpers puros exportados (`buildRelationFilterParams`, `buildCreatePayload`, `deriveRelationFormFields`, `relationRowKey`) para que callers reutilicen las convenciones fuera del componente.
- `kind="many_to_many"` queda stubbed (renderiza `not-implemented`) — sigue como follow-up; la RFC completa vive en `packages/runtime-react/docs/relations.md`.
- Ejemplo end-to-end en `examples/dynamic-relation-one-to-many/`.
