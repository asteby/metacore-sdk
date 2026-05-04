---
"@asteby/metacore-sdk": minor
---

feat(sdk): regenerar tipos TS del manifest para reflejar nuevos campos en `ColumnDef`, `RelationDef` y `ActionDef.Trigger`.

- `ColumnDef` extendido con `visibility?` (`"table"|"modal"|"list"|"all"`), `searchable?`, `validation?` (regex/min/max/custom) y `widget?`. Nuevo `ValidationRule`. Backwards compat: zero-value mantiene el comportamiento actual.
- Nuevo `RelationDef` (`kind: "one_to_many"|"many_to_many"`, `through`, `foreign_key`, `references?`, `pivot?`, `name`) y campo `relations?: RelationDef[]` en `ModelDefinition`.
- Nuevo `ActionTrigger` (`type: "wasm"|"webhook"|"noop"`, `export?`, `run_in_tx?`) y campo `trigger?: ActionTrigger` en `ActionDef`. Nil = comportamiento legacy webhook.

Cambios mecánicos:

- `packages/sdk/src/generated/manifest.ts`: regenerado vía `pnpm codegen`.
- `packages/sdk/src/types.ts`: re-export añadido para `ActionTrigger`, `ValidationRule`, `RelationDef`.

No breaking. Apps consumidoras que no lean los campos nuevos no requieren cambios. Apps Fase 2 (runtime-react `dynamic-table`/`dynamic-form`) los empezarán a consumir en PRs siguientes.
