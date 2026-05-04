# @asteby/metacore-sdk

## 2.4.0

### Minor Changes

- ec9ad56: feat(sdk): regenerar tipos TS del manifest para reflejar nuevos campos en `ColumnDef`, `RelationDef` y `ActionDef.Trigger`.
  - `ColumnDef` extendido con `visibility?` (`"table"|"modal"|"list"|"all"`), `searchable?`, `validation?` (regex/min/max/custom) y `widget?`. Nuevo `ValidationRule`. Backwards compat: zero-value mantiene el comportamiento actual.
  - Nuevo `RelationDef` (`kind: "one_to_many"|"many_to_many"`, `through`, `foreign_key`, `references?`, `pivot?`, `name`) y campo `relations?: RelationDef[]` en `ModelDefinition`.
  - Nuevo `ActionTrigger` (`type: "wasm"|"webhook"|"noop"`, `export?`, `run_in_tx?`) y campo `trigger?: ActionTrigger` en `ActionDef`. Nil = comportamiento legacy webhook.

  Cambios mecánicos:
  - `packages/sdk/src/generated/manifest.ts`: regenerado vía `pnpm codegen`.
  - `packages/sdk/src/types.ts`: re-export añadido para `ActionTrigger`, `ValidationRule`, `RelationDef`.

  No breaking. Apps consumidoras que no lean los campos nuevos no requieren cambios. Apps Fase 2 (runtime-react `dynamic-table`/`dynamic-form`) los empezarán a consumir en PRs siguientes.

## 2.3.0

### Minor Changes

- c91d778: Export marketplace types via new `@asteby/metacore-sdk/marketplace` sub-path. Adds CatalogAddon, AddonDetail, AddonVersion (hub catalog shapes) and re-exports the manifest types so hub/landing and hub/frontend stop redeclaring them.

## 2.2.0

### Minor Changes

- e23eede: Publicación inicial a npm del ecosistema metacore.

  Propaga los 13 paquetes del SDK al registry público para que las host applications consumidoras migren de `file:` a semver y Renovate pueda propagar updates.

## 2.1.0

### Minor Changes

- Manifest types ahora se generan desde Go via tygo. Fuente: pkg/manifest/manifest.go.
- 6d243b0: Initial release of the metacore frontend ecosystem.

  11 packages extracted from host application frontends into a publishable monorepo with auto-propagation via Changesets + Renovate.
