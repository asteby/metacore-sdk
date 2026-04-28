# @asteby/metacore-runtime-react

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
