# @asteby/metacore-i18n

## 16.0.0

### Patch Changes

- Updated dependencies [0704d54]
  - @asteby/metacore-ui@2.10.0

## 15.0.0

### Patch Changes

- Updated dependencies [25a78e7]
  - @asteby/metacore-ui@2.9.0

## 14.0.0

### Patch Changes

- Updated dependencies [bd30e57]
  - @asteby/metacore-ui@2.8.0

## 13.0.0

### Patch Changes

- Updated dependencies [84aeaf2]
  - @asteby/metacore-ui@2.7.0

## 12.0.0

### Patch Changes

- Updated dependencies [3f41073]
  - @asteby/metacore-ui@2.6.0

## 11.0.0

### Patch Changes

- Updated dependencies [8439e9e]
  - @asteby/metacore-ui@2.5.0

## 10.0.0

### Patch Changes

- Updated dependencies [5f864d9]
  - @asteby/metacore-ui@2.4.0

## 9.0.0

### Patch Changes

- Updated dependencies [ab41d75]
  - @asteby/metacore-ui@2.3.0

## 8.0.0

### Patch Changes

- Updated dependencies [6299af7]
  - @asteby/metacore-ui@2.2.0

## 7.0.1

### Patch Changes

- a9db218: fix(addon-i18n): never overwrite a cached bundle with an empty fetch result

  useAddonI18n re-validates the addon i18n bundle from the Hub in the background.
  fetchAddonI18n returns `{}` on a 404 or empty response, and the hook applied it
  unconditionally — so a transient Hub hiccup blanked the live labels AND wrote `{}`
  to localStorage, poisoning the cache for 6h. The sidebar then fell back to
  humanized keys (e.g. "accounting.nav.group" → "Group") intermittently. An empty
  result is now treated as "no update", leaving the cached/installed bundle intact.

## 7.0.0

### Patch Changes

- Updated dependencies [3b40ed5]
  - @asteby/metacore-ui@2.1.0

## 6.0.0

### Patch Changes

- Updated dependencies [64de425]
  - @asteby/metacore-ui@2.0.0

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
