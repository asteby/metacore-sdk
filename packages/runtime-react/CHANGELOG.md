# @asteby/metacore-runtime-react

## 9.0.0

### Minor Changes

- d51ef45: feat(runtime-react): `DynamicForm` aplica `Validation` (regex/min/max) al schema zod generado y soporta widgets `textarea`/`richtext`/`color`.
  - `ActionFieldDef` extendido con `validation?: FieldValidation` (regex/min/max/custom — espejo del `ValidationRule` del manifest del kernel) y `widget?: FieldWidget | string`.
  - `DynamicForm` ahora deriva un schema zod por field y valida en el submit, mostrando errores inline en lugar del `alert()` previo. Min/max aplica como longitud para strings y como bound para numéricos (mismo dual semantics que el kernel). Regex malformada del manifest se ignora silenciosamente para no tirar el render.
  - Nuevo export `buildZodSchema(fields)` para que callers reutilicen el mismo schema fuera del form.
  - Renderer mapea widgets explícitos a primitivos de `@asteby/metacore-ui`:
    - `textarea` → `Textarea`
    - `richtext` → `Textarea` con `data-widget="richtext"` (puente hasta que aterrice un primitivo MDX/rich; mantiene el contrato sin romper consumers).
    - `color` → `Input type="color"`.
  - Backwards compat: zero-value (sin `validation`/`widget`) preserva el comportamiento previo (widget inferido por `type`, sin reglas de validación más allá de `required`).

- 88b176c: feat(runtime-react): `<DynamicRelation kind="many_to_many">` — multi-select sobre la tabla destino, sync transparente contra la tabla pivote (`through`).

  API mínima:

  ```tsx
  <DynamicRelation
    kind="many_to_many"
    through="org_members" // tabla pivote
    references="users" // tabla destino sobre la que se hace multi-select
    foreignKey="organization_id" // FK del pivot al padre
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

- 88b176c: feat(runtime-react): nuevo `<DynamicRelation kind="one_to_many">` — lista inline editable que cuelga del registro padre.

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

### Patch Changes

- Updated dependencies [ec9ad56]
  - @asteby/metacore-sdk@2.4.0

## 8.0.0

### Patch Changes

- Updated dependencies [c91d778]
- Updated dependencies [64de425]
  - @asteby/metacore-sdk@2.3.0
  - @asteby/metacore-ui@2.0.0

## 7.1.5

### Patch Changes

- 922d63b: Add `<MetacoreAppShell>` — single-line provider wiring for metacore apps.

  Today every app reproduces the same eight-deep wedding cake of providers (QueryClient + ApiProvider + PWAProvider + Toaster + install/update/offline prompts + metadata cache invalidation). The new shell collapses it into:

  ```tsx
  import { MetacoreAppShell } from "@asteby/metacore-app-providers";

  <MetacoreAppShell api={api} queryClient={queryClient}>
    <RouterProvider router={router} />
  </MetacoreAppShell>;
  ```

  What it bundles:
  - `QueryClientProvider` (when `queryClient` is supplied)
  - `ApiProvider` from `runtime-react`
  - `PWAProvider` + `PWAInstallPrompt` + `PWAUpdatePrompt` + `OfflineIndicator`
  - `Toaster` from `metacore-ui`
  - A `MetadataInvalidator` that clears `useMetadataCache` the moment the PWA layer reports a new service worker — so the next mount of `<DynamicTable>` fetches fresh column / filter / actions definitions instead of replaying yesterday's metadata. Resolves the stale-cache bug where adding `filterable: true` to a column on the backend was invisible until users cleared localStorage.

  Apps that want a subset can pass `hidePWAInstall` / `hidePWAUpdate` / `hideOfflineIndicator` / `hideToaster` / `disableMetadataInvalidate` to opt out per layer.

  `runtime-react` patch: also switches `<DynamicTable>` to stale-while-revalidate metadata fetch (paint with cache, always re-fetch in background) so the shell isn't the only path that picks up backend changes.

- 922d63b: Auto-derive `date_range` filter for `type: 'date'` columns.

  The zero-config filter chip in 7.1.0 picked the right variant for text/number/boolean/select but mapped `type: 'date'` to a generic text filter. `FilterableColumnHeader` already supports `date_range` — pointing the auto-derive at it makes any column flagged `filterable: true` with `type: 'date'` light up the calendar range picker without app-side glue.

## 7.1.4

### Patch Changes

- c985453: Auto-derive `date_range` filter for `type: 'date'` columns.

  The zero-config filter chip in 7.1.0 picked the right variant for text/number/boolean/select but mapped `type: 'date'` to a generic text filter. `FilterableColumnHeader` already supports `date_range` — pointing the auto-derive at it makes any column flagged `filterable: true` with `type: 'date'` light up the calendar range picker without app-side glue.

## 7.1.3

### Patch Changes

- db1a224: Fix raw i18n keys leaking into the auto-generated CRUD actions dropdown.

  The auto-Actions column shipped in 7.1.0 looked up `datatable.view_record`, `datatable.edit` and `datatable.delete` — keys that didn't exist in `@asteby/metacore-i18n/locales`, so i18next fell back to the key string and the dropdown rendered "datatable.view_record" instead of "Ver".

  Two fixes:
  - `@asteby/metacore-i18n`: add `datatable.edit` and `datatable.delete` to the base ES/EN bundles (alongside the pre-existing `datatable.view`).
  - `@asteby/metacore-runtime-react`: lookup `datatable.view` (the real key) and pass `{ defaultValue }` to every action label so a missing bundle never leaks the key into the UI.

## 7.1.2

### Patch Changes

- c00d7f9: Fix DynamicTable horizontal scrollbar appearing mid-card.

  `<Table>` from `@asteby/metacore-ui` ships its own `overflow-x-auto` wrapper sized to content height. Combined with DynamicTable's outer `flex-1 min-h-0 overflow-auto` card, the inner scrollbar drew at the bottom of the rendered rows (mid-card) instead of pinned to the card's bottom edge — wide tables felt visually broken when there were few rows.

  Pass `noWrapper` to opt out of shadcn's inner wrapper. The outer SDK wrapper now owns the scroll; horizontal scrollbar pins to the bottom of the card as expected.

## 7.1.1

### Patch Changes

- 76d4b58: Align SDK dialogs to the kernel's `/dynamic/:model` path namespace.

  `<DynamicRecordDialog>`, `<ExportDialog>` and `<ImportDialog>` were posting to `/data/:model[/...]`, which had no kernel handler — apps that didn't ship their own `handlers/export.go` got 404s the moment a user clicked Export, Import or "Descargar plantilla".

  Switches every hardcoded path from `/data/${model}` to `/dynamic/${model}`. Pairs with `metacore-kernel v0.5.0`, which exposes the canonical `/dynamic/:model/export`, `/dynamic/:model/export/template`, `/dynamic/:model/import`, `/dynamic/:model/import/validate` endpoints — so the SDK toolbar now wires straight to the kernel out of the box, no app glue.

## 7.1.0

### Minor Changes

- 0cd085c: Zero-config CRUD UX from a single column flag.

  Three changes that move polish from each app's metadata into the SDK default behaviour, so a model only needs `enableCRUDActions: true` plus `filterable: true` on the columns it wants searchable to get the same UX link / ops / hub render today:
  1. **Auto-derive filter chip type from column type.** A column flagged `filterable: true` without options or a `searchEndpoint` no longer falls back to "no filter" — it picks the FilterableColumnHeader variant that matches the column type: `text` for text/email/phone/tags, `number_range` for numeric columns, `boolean` for booleans, `select` when options/endpoint are present.
  2. **Auto-render the row Actions column when `enableCRUDActions` is on.** If the host metadata already declares its own `actions[]`, those win. When it doesn't, the SDK falls back to the canonical View / Edit / Delete trio wired to DynamicTable's existing `view` / `edit` / `delete` handlers — no host-side glue.
  3. **`<DynamicCRUDPage>` defaults `hideRefresh` to `true`.** The page-level Refresh button duplicated the one DynamicTable's internal toolbar already ships next to "View"; the page chrome now defers to it. Apps that want both back can pass `hideRefresh={false}`.

## 7.0.0

### Patch Changes

- 3450876: Add `getInitials(name)` helper to `@asteby/metacore-ui/lib`.

  Pulls a duplicated 6-line snippet (`name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()`) out of every avatar across the platform — chat headers, profile dropdowns, dynamic-table avatar cells, sidebar nav. Trims whitespace, caps token count, and falls back to a single character when the input is empty.

  `runtime-react`'s avatar cell renderer now uses it; visually identical, one less inline lambda.

- Updated dependencies [3450876]
  - @asteby/metacore-ui@0.7.0

## 6.4.0

### Minor Changes

- d7f1e55: Per-model extension registry, badge cell normalization, and auto-derived filter chips.
  - `registerModelExtension(model, ext)` lets apps layer per-model UI on top of `<DynamicCRUDPage>` (header KPI strip, custom toolbar buttons, hidden create flow, title overrides) without forking the page or copy-pasting it.
  - `defaultGetDynamicColumns` now accepts `type === 'badge'` (what the kernel emits) in addition to `cellStyle === 'badge'`. Columns marked `type: badge` previously rendered as plain text.
  - `<DynamicTable>` derives a filter chip from every column flagged `filterable: true` plus either static options, a `searchEndpoint`, or boolean type, so apps no longer need to mirror the same options into a separate `filters` array on the metadata. Explicit `metadata.filters` still wins when present.
  - Fixes the default `getDynamicColumns` fallback that previously read `col.name` instead of `col.key`, leaving cells blank for hosts that did not pass a custom factory.

## 6.0.0

### Patch Changes

- Updated dependencies [1c93e68]
  - @asteby/metacore-ui@0.6.0

## 5.0.0

### Patch Changes

- Updated dependencies [317b021]
  - @asteby/metacore-ui@0.5.0

## 4.0.0

### Minor Changes

- e23eede: Publicación inicial a npm del ecosistema metacore.

  Propaga los 13 paquetes del SDK al registry público para que las host applications consumidoras migren de `file:` a semver y Renovate pueda propagar updates.

### Patch Changes

- Updated dependencies [e23eede]
  - @asteby/metacore-sdk@2.2.0
  - @asteby/metacore-ui@0.3.0

## 3.0.0

### Minor Changes

- 6d243b0: Initial release of the metacore frontend ecosystem.

  11 packages extracted from host application frontends into a publishable monorepo with auto-propagation via Changesets + Renovate.

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies [6d243b0]
  - @asteby/metacore-sdk@2.1.0
  - @asteby/metacore-ui@0.2.0
