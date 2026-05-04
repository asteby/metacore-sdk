# @asteby/metacore-tools

## 2.0.0

### Patch Changes

- Updated dependencies [ec9ad56]
  - @asteby/metacore-sdk@2.4.0

## 1.0.0

### Patch Changes

- Updated dependencies [c91d778]
  - @asteby/metacore-sdk@2.3.0

## 0.1.1

### Patch Changes

- 1c93e68: First release of `@asteby/metacore-tools` — the TypeScript counterpart of
  the kernel's `tool` runtime. Package was present as a stale
  `feat/tool-client` branch with `dist/` already generated; this release
  lands the source and manifest on `main`.
  - `ToolClient` + `HTTPToolClient`: transport-agnostic execution against
    the host backend (`POST /tools/execute`, `GET /tools`).
  - `ToolRegistry`: client-side cache keyed by `addon + id`, hydrated once
    per session from `client.list()`.
  - `validateParams`: mirrors the Go kernel's `tool.Validate()` rules
    exactly (required/default/normalize, type, regex) so client-side and
    server-side validation agree.
  - Types `ToolExecutionRequest`, `ToolExecutionResponse`,
    `ValidationError`; re-exports `ToolDef`, `ToolInputParam` from
    `@asteby/metacore-sdk` (tygo-generated from Go source).

  Unblocks host applications consuming this via
  `file:../../metacore-sdk/packages/tools`; prior to this release the
  package had `dist/` but no `package.json`, so `go build`-equivalent
  pnpm resolution failed at the file-link step.
