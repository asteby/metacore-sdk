# @asteby/metacore-sdk

## 2.2.0

### Minor Changes

- e23eede: Publicación inicial a npm del ecosistema metacore.

  Propaga los 13 paquetes del SDK al registry público para que apps consumidoras (ops, link) migren de `file:` a semver y Renovate pueda propagar updates.

## 2.1.0

### Minor Changes

- Manifest types ahora se generan desde Go via tygo. Fuente: pkg/manifest/manifest.go.
- 6d243b0: Initial release of the metacore frontend ecosystem.

  11 packages extracted from ops/link frontends into a publishable monorepo with auto-propagation via Changesets + Renovate.
