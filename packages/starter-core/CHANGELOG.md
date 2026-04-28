# @asteby/metacore-starter-core

## 4.0.0

### Patch Changes

- Updated dependencies [3450876]
  - @asteby/metacore-ui@0.7.0
  - @asteby/metacore-auth@6.0.0

## 3.0.0

### Patch Changes

- Updated dependencies [ea200fb]
  - @asteby/metacore-auth@5.0.0

## 2.0.0

### Patch Changes

- Updated dependencies [c9e78a0]
  - @asteby/metacore-auth@4.1.0

## 1.1.1

### Patch Changes

- a2f9f39: Republish starter-core with the compiled `dist/` bundle. The 1.1.0 tarball was uploaded without `dist/` because that release race-condition'd with the CI fix (PR #23) — the publish step ran with the previous workflow that excluded starter-core from the build. Consumers hit `Failed to resolve module specifier "@asteby/metacore-starter-core"` in the browser. No source changes; this is a packaging fix only.

## 1.1.0

### Minor Changes

- 014c3cc: Make `@asteby/metacore-starter-core` publishable. Removed `"private": true` and dropped the package from the changeset `ignore` list. The first published version (1.0.x) is the same source the workspace consumers have been using via `workspace:*` until now.

  Consumers that previously used `file:../../metacore-sdk/packages/starter-core` can switch to `^1.0.0` from npm.

## 1.0.0

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies [6d243b0]
  - @asteby/metacore-theme@0.2.0
  - @asteby/metacore-sdk@2.1.0
  - @asteby/metacore-ui@0.2.0
  - @asteby/metacore-auth@1.0.0
