# @asteby/metacore-starter-monaco

## 0.2.1

### Patch Changes

- 5dae350: Postbuild fix-dist-esm-imports: los imports relativos de dist/ llevan extension (.js) para que Node ESM los resuelva; i18n importa sus JSON con `with { type: 'json' }`.

## 0.2.0

### Minor Changes

- 738f41b: Split Monaco editor into opt-in `@asteby/metacore-starter-monaco` package.

  **Breaking** — `CodeEditor` no longer ships from `@asteby/metacore-starter-core`. Apps that used it must:
  1. `pnpm add @asteby/metacore-starter-monaco @monaco-editor/react`
  2. Update import: `import { CodeEditor } from '@asteby/metacore-starter-monaco'`
  3. Pass `theme` as a prop (the new package is decoupled from `starter-core`'s theme provider).

  Apps that did not use `CodeEditor` save the full Monaco bundle (~2MB pre-gzip) and the `@monaco-editor/react` peer dependency.

  Also fixes a missing peer dependency: `@asteby/metacore-runtime-react` is now declared as a `peerDependency` of `starter-core` (was imported by internal shims under `components/dynamic/*` without being declared).
