---
"@asteby/metacore-runtime-react": minor
---

feat(runtime-react): `<DynamicRelation kind="many_to_many">` — multi-select sobre la tabla destino, sync transparente contra la tabla pivote (`through`).

API mínima:

```tsx
<DynamicRelation
    kind="many_to_many"
    through="org_members"     // tabla pivote
    references="users"         // tabla destino sobre la que se hace multi-select
    foreignKey="organization_id"   // FK del pivot al padre
    parentId={org.id}
/>
```

- `referencesKey` por default es `${references}_id` (override opcional). Endpoints `/data/${through}` y `/data/${references}` con override por prop si la app expone rutas custom.
- Lectura: lista pivot rows filtradas por `f_<foreignKey>=eq:<parentId>` (mismo envelope kernel `{success, data, meta}` que `<DynamicTable>`); lista target rows del modelo `references`.
- Escritura: el `<MultiSelect>` dispara un diff entre la selección previa y la nueva. Cada nuevo target → `POST /data/${through}` con `{[foreignKey]: parentId, [referencesKey]: targetId}`. Cada target removido → `DELETE /data/${through}/<pivotRowId>`.
- Permisos por prop (`canCreate` controla attach, `canDelete` controla detach — default `true`).
- Label de cada opción: `displayKey` prop si está; si no se infiere de la metadata (primer column no-id no-hidden); fallback al `id`.
- Nuevos helpers puros exportados: `buildPivotAttachPayload`, `extractSelectedTargetIds`, `buildPivotRowIndex`, `diffSelection`, `pickOptionLabel`.

`kind="one_to_many"` no cambia.
