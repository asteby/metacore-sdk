# @asteby/metacore-i18n

## 5.1.0

### Minor Changes

- 0d1a6f5: Add `useAddonI18n` + `useAddonNames` hooks under `@asteby/metacore-i18n/addon-i18n` that fetch each addon's manifest i18n bundle from the Hub and stay reactive to `useLocale()`. Memory + localStorage cache with 6h TTL. The starter sidebar now uses `useAddonNames` so the installed-addon list shows the localised display name and live-updates on language switch — no reinstall required.

  Resolution order in the sidebar: Hub-published manifest i18n → install-time `row.name` (set by the Hub iframe at click time) → raw `addon_key`.

  Pairs with `asteby-hq/hub#73` adding the `/v1/addons/{key}/i18n/{lang}.json` endpoint.

## 5.0.1

### Patch Changes

- db1a224: Fix raw i18n keys leaking into the auto-generated CRUD actions dropdown.

  The auto-Actions column shipped in 7.1.0 looked up `datatable.view_record`, `datatable.edit` and `datatable.delete` — keys that didn't exist in `@asteby/metacore-i18n/locales`, so i18next fell back to the key string and the dropdown rendered "datatable.view_record" instead of "Ver".

  Two fixes:
  - `@asteby/metacore-i18n`: add `datatable.edit` and `datatable.delete` to the base ES/EN bundles (alongside the pre-existing `datatable.view`).
  - `@asteby/metacore-runtime-react`: lookup `datatable.view` (the real key) and pass `{ defaultValue }` to every action label so a missing bundle never leaks the key into the UI.

## 5.0.0

### Patch Changes

- Updated dependencies [3450876]
  - @asteby/metacore-ui@0.7.0

## 4.0.0

### Patch Changes

- Updated dependencies [1c93e68]
  - @asteby/metacore-ui@0.6.0

## 3.0.0

### Patch Changes

- Updated dependencies [317b021]
  - @asteby/metacore-ui@0.5.0

## 2.0.0

### Minor Changes

- e23eede: Publicación inicial a npm del ecosistema metacore.

  Propaga los 13 paquetes del SDK al registry público para que las host applications consumidoras migren de `file:` a semver y Renovate pueda propagar updates.

### Patch Changes

- Updated dependencies [e23eede]
  - @asteby/metacore-ui@0.3.0

## 1.0.0

### Minor Changes

- 6d243b0: Initial release of the metacore frontend ecosystem.

  11 packages extracted from host application frontends into a publishable monorepo with auto-propagation via Changesets + Renovate.

### Patch Changes

- Updated dependencies
- Updated dependencies [6d243b0]
  - @asteby/metacore-ui@0.2.0
