# create-metacore-addon

## 1.0.4

### Patch Changes

- f9616d1: Un solo registro para modales, slots y acciones, y acciones secundarias fuera de la vista principal:

  - `@asteby/metacore-sdk` es la única fuente de verdad: `registerModalComponent` (modales por slug, con addon dueño y `load` perezoso), `registerRecordAction` (acciones secundarias sobre registros con su proveedor `requires: { addon | capability }`) y `slotStore`. `Registry.scope(addon).registerModal/registerAction/registerSlot` escriben ahí (antes `registerModal` no tenía lector) y `unbind` lo retira todo. `adaptActionProps` entrega a un remote ambos contratos de props (ActionModalProps y recordId/payload/close).
  - `registerFederatedModal` queda como alias deprecado y compatible de `registerModalComponent`; `slotRegistry` y `<Slot>` de runtime-react leen el `slotStore` del SDK y no pintan contribuciones de addons no instalados.
  - Acciones primarias/secundarias: `priority` del manifest v3 (o convención por clave: print, share, email, mail, whatsapp, chat, download, pdf, xml, acuse). `RowActionsMenu` (menú «…» por defecto de DynamicTable) muestra una primaria destacada y agrupa las secundarias y las aportadas por addons en «Más…»; las acciones por capacidad sin proveedor activo no se ofrecen. `DocumentPage` manda las secundarias de su layout a `DocumentSecondaryBar` (pie) y `resolveActions` devuelve el nuevo grupo `footer`.
  - i18n: `datatable.more_actions`, `datatable.open_menu`, `datatable.secondary_actions` (es/en).

## 1.0.3

### Patch Changes

- 5b64c23: Federation CI budgets: `metacoreFederationBudgetPlugin` + `assertFederationDistBudgets` mirror hub publish ceilings (512 KiB remoteEntry / 4 MiB frontend). `metacoreFederationShared` now asserts mandatory singletons (and the published `.js` again includes `@tanstack/react-query`). New addons scaffold with the budget plugin wired.

## 1.0.2

### Patch Changes

- 1402dca: Marcar create-metacore-addon como `private: true` para deshabilitar publicación al npm. El package falla con E403 al publish porque el token NPM_TOKEN no tiene permiso para crear packages unscoped — el publishConfig.access no resuelve esto. Decisión sobre naming (mantener unscoped con cuenta personal del owner vs migrar a `@asteby/create-metacore-addon`) queda como follow-up.

## 1.0.1

### Patch Changes

- 3f15c1d: Declarar `publishConfig.access: public` en `create-metacore-addon`. Sin este flag npm trata el primer release de un package unscoped como restricted contra tokens de organización y rechaza con E403, bloqueando el resto del release pipeline.

## 1.0.0

### Major Changes

- 26063a4: Migrate the SDK toolchain from Module Contract v2 to v3.

  The CLI now validates and emits **v3** manifests (`apiVersion:
"asteby.com/v3"`) via the kernel's strict `manifest/v3` parser, and the kernel
  dependency is bumped to `v0.20.0`. `metacore init` and `create-metacore-addon`
  scaffold v3 manifests (`kind`, nested `metadata{}`, `compatibility{}`,
  `models[]`, `contributions{}`, `extension_points{}`, `rbac{}`).

  **Breaking — `@asteby/metacore-sdk`:** the canonical `Manifest` and related
  exported types now mirror the v3 contract (`metadata.key`, `models[]`,
  `contributions.actions[]`, …). The legacy v2 types remain available — the
  v2-only names (`ModelDefinition`, `ColumnDef`, `ActionDef`, `BackendSpec`,
  `HookDef`, `ToolDef`, …) are re-exported unchanged, and the names that collide
  with v3 (`Manifest`, `Capability`, `NavGroup`, …) are re-exported under a
  `Legacy*` alias. Runtime/host-facing surfaces (`MarketplaceClient`,
  `AddonAPI`, `MetacoreProvider`) consume the host's legacy/flat manifest
  projection (`LegacyManifest`), which is unchanged.

  The kernel continues to dual-read v2 manifests during the 3.x line, so
  already-published v2 addons keep installing.
