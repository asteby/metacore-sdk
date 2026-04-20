# @asteby/metacore-theme

## 0.3.0

### Minor Changes

- e23eede: Publicación inicial a npm del ecosistema metacore.

  Propaga los 13 paquetes del SDK al registry público para que apps consumidoras (ops, link) migren de `file:` a semver y Renovate pueda propagar updates.

## 0.2.0

### Minor Changes

- Add ThemeProvider and useTheme hook (cookie-based, dark/light/system) so consumer apps can drop their local theme-provider copies.
- 6d243b0: Initial release of the metacore frontend ecosystem.

  11 packages extracted from ops/link frontends into a publishable monorepo with auto-propagation via Changesets + Renovate.
