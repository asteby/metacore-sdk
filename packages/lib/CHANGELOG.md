# @asteby/metacore-lib

## 0.4.0

### Minor Changes

- 64de425: Add `showSubmittedData` helper (re-exported from the package root and from the `./show-submitted-data` subpath). Renders a sonner toast that pretty-prints any payload as JSON — convenience for showcase / demo forms that want to confirm the submitted shape without wiring a real success path.

  `react` and `sonner` are declared as optional peer dependencies (the rest of `@asteby/metacore-lib` remains React-free).

## 0.3.0

### Minor Changes

- e23eede: Publicación inicial a npm del ecosistema metacore.

  Propaga los 13 paquetes del SDK al registry público para que las host applications consumidoras migren de `file:` a semver y Renovate pueda propagar updates.

## 0.2.0

### Minor Changes

- 6d243b0: Initial release of the metacore frontend ecosystem.

  11 packages extracted from host application frontends into a publishable monorepo with auto-propagation via Changesets + Renovate.
