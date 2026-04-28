# create-metacore-app

## 0.5.0

### Minor Changes

- d7f1e55: Add `--example <name>` flag that clones a folder from `asteby/metacore-sdk/examples/<name>` via tiged and freezes every `workspace:*` dependency to the latest published npm version.

  Same fast-path that powers `create-next-app --example`, with no template duplication. The fullstack starter is the first consumer:

  ```
  npm create @asteby/metacore-app my-app -- --example fullstack-starter
  ```

## 0.3.0

### Minor Changes

- 16be5d2: Make `create-metacore-app` publishable. Removed `"private": true`, dropped the package from the changeset `ignore` list, and removed the corresponding `--filter=!create-metacore-app` flags from the build and release workflows.

  Once published, scaffolding a metacore app is one command:

  ```bash
  npx create-metacore-app my-platform
  ```

## 0.2.0

### Minor Changes

- e23eede: Publicación inicial a npm del ecosistema metacore.

  Propaga los 13 paquetes del SDK al registry público para que las host applications consumidoras migren de `file:` a semver y Renovate pueda propagar updates.
