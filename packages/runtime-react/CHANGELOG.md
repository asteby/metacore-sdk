# @asteby/metacore-runtime-react

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
