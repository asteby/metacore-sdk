---
'@asteby/metacore-sdk': minor
'@asteby/metacore-runtime-react': minor
'@asteby/metacore-starter-config': minor
---

feat: immersive layout, federation shared-deps helper polish, wasm client

**sdk:**

- `FrontendSpec` now carries `layout?: "shell" | "immersive"`. Mirrors the
  upcoming kernel-side `manifest.FrontendSpec.Layout` field. `undefined` is
  treated as `"shell"` (legacy behaviour) so the change is purely additive.
  Exposed as the `AddonLayout` type alias for explicit consumers.
- New `wasm-client` module — frontend twin of `kernel/runtime/wasm`. Ships
  `loadAddonWasm({ url, integrity, imports })` (SRI verification + instantiate
  pipeline) and `callAddonExport(instance, fn, payload)` honouring the same
  `ptr<<32 | len` packed ABI the Go example backends use (`alloc`, `free`,
  `memory`). Lets POS / kitchen-display / signage addons run their compiled
  module locally for sub-50ms latency without a webhook round trip. Typed
  errors (`WasmIntegrityError`, `WasmAbiError`) surface failure cause cleanly.

**runtime-react:**

- New `<AddonLayoutProvider>`, `useAddonLayout()`, `useAddonLayoutControl()`
  and `useDeclareAddonLayout()` API in `addon-layout-context`. The host shell
  reads the active layout and hides Sidebar / Topbar / breadcrumbs when an
  addon declares `layout: "immersive"`. Cleanup restores chrome on unmount,
  so navigating away from an immersive addon brings the shell back.
- `<AddonLoader>` accepts an optional `layout` prop and propagates it through
  the context, so hosts get the chrome switch wired without per-route plumbing.

**starter-config:**

- `metacoreFederationShared()` now accepts `extra: Record<string, ShareConfig>`
  for the typical "I just want to add a package with explicit config" case
  (`extra: { lodash: { singleton: true } }`). The existing `extras: string[]`
  and `overrides` knobs are retained for backwards compatibility.
- `METACORE_FEDERATION_SINGLETONS` adds `@asteby/metacore-app-providers` so
  the SDK's transport-agnostic platform provider keeps a single instance
  between host and addons.
