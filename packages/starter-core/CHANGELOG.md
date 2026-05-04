# @asteby/metacore-starter-core

## 8.0.0

### Patch Changes

- Updated dependencies [2e50839]
  - @asteby/metacore-runtime-react@9.1.0

## 7.0.1

### Patch Changes

- 3e5d9ab: fix(starter-core): leer backend URL de globalThis en runtime, no de
  import.meta.env. La 4.0.0 tenía `http://localhost:8080` baked in del
  build de la lib (Vite inline `import.meta.env` durante el build de la
  lib, no de la app que la consume), rompiendo `getStorageUrl` y
  `getImageUrl` en cualquier app de prod — los logos del sidebar y
  avatares apuntaban a localhost del visitante. Ahora ambas funciones
  leen `globalThis.__METACORE_BACKEND_URL__`, que la app consumidora
  setea en su entry point antes de cualquier import del SDK:

  ```ts
  (globalThis as any).__METACORE_BACKEND_URL__ =
    import.meta.env.VITE_BACKEND_URL;
  ```

  Funciona idénticamente en Vite, Next.js y cualquier runtime del
  navegador.

## 7.0.0

### Patch Changes

- Updated dependencies [d51ef45]
- Updated dependencies [88b176c]
- Updated dependencies [88b176c]
- Updated dependencies [ec9ad56]
  - @asteby/metacore-runtime-react@9.0.0
  - @asteby/metacore-sdk@2.4.0

## 6.0.1

### Patch Changes

- 5739183: fix(starter-core): leer backend URL de globalThis en runtime, no de
  import.meta.env. La 4.0.0 tenía `http://localhost:8080` baked in del
  build de la lib (Vite inline `import.meta.env` durante el build de la
  lib, no de la app que la consume), rompiendo `getStorageUrl` y
  `getImageUrl` en cualquier app de prod — los logos del sidebar y
  avatares apuntaban a localhost del visitante. Ahora ambas funciones
  leen `globalThis.__METACORE_BACKEND_URL__`, que la app consumidora
  setea en su entry point antes de cualquier import del SDK:

  ```ts
  (globalThis as any).__METACORE_BACKEND_URL__ =
    import.meta.env.VITE_BACKEND_URL;
  ```

  Funciona idénticamente en Vite, Next.js y cualquier runtime del
  navegador.

## 6.0.0

### Major Changes

- 738f41b: Split Monaco editor into opt-in `@asteby/metacore-starter-monaco` package.

  **Breaking** — `CodeEditor` no longer ships from `@asteby/metacore-starter-core`. Apps that used it must:
  1. `pnpm add @asteby/metacore-starter-monaco @monaco-editor/react`
  2. Update import: `import { CodeEditor } from '@asteby/metacore-starter-monaco'`
  3. Pass `theme` as a prop (the new package is decoupled from `starter-core`'s theme provider).

  Apps that did not use `CodeEditor` save the full Monaco bundle (~2MB pre-gzip) and the `@monaco-editor/react` peer dependency.

  Also fixes a missing peer dependency: `@asteby/metacore-runtime-react` is now declared as a `peerDependency` of `starter-core` (was imported by internal shims under `components/dynamic/*` without being declared).

### Patch Changes

- 64de425: Replace the duplicated `direction-provider`, `font-provider`, `layout-provider`, and `search-provider` files under `src/context/` with thin re-exports from `@asteby/metacore-app-providers`, which is the source of truth for transport-agnostic context providers in the metacore ecosystem.

  The duplicates were never part of starter-core's published surface (the package only ships `lib/` + `components/ui/` from `src/index.ts`), so this is a no-op for consumers — but it removes ~250 lines of drift-prone copy/paste and ensures any future tweak to a provider lands in one place.

  Two real divergences from the legacy starter copies are intentional and live in the source of truth:
  - `FontProvider` now requires an explicit `fonts` prop (use `import { fonts } from '@asteby/metacore-starter-config/fonts'`) instead of reading a hard-coded list.
  - `SearchProvider` no longer auto-renders `<CommandMenu />`; apps mount their own command menu inside the authenticated layout.

- Updated dependencies [c91d778]
- Updated dependencies [0e8db78]
- Updated dependencies [64de425]
  - @asteby/metacore-sdk@2.3.0
  - @asteby/metacore-theme@2.0.0
  - @asteby/metacore-ui@2.0.0
  - @asteby/metacore-runtime-react@8.0.0
  - @asteby/metacore-auth@7.0.0

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
