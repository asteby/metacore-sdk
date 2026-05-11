# @asteby/metacore-starter-core

## 10.0.0

### Minor Changes

- 9ce8269: feat: hot-swap reload policy (RFC-0001 D4 close)

  Closes the gap between `useManifestHotSwapSubscriber` (already invalidates
  the metadata cache) and the federation container of an already-mounted
  addon, which keeps the old code in memory until something forces a
  re-evaluation.

  **runtime-react:**
  - New `hotswap-reload-policy` module ships three policies and a single
    hook that wires the chosen policy to the manifest hot-swap stream:
    - `useHotSwapReload(client, { strategy })` returns `{ addonVersionMap }`
      — a reactive map `addonKey → hashShort` that hosts wire into
      `<AddonRoute version={addonVersionMap[addonKey]} ... />`. Default
      strategy is `"rekey"`: React unmounts and remounts the addon subtree
      on every swap, which forces the federation loader to re-fetch
      `remoteEntry.js?v=<hash8>` and re-evaluate the exposed module.
    - `strategy: "page-reload"` is an opt-in `window.location.reload()`
      escape hatch for immersive addons with critical in-progress state
      (POS, kitchen-display). Pair with `onBeforeReload` to surface an
      "unsaved changes" prompt — returning `false` cancels the reload.
    - `strategy: "manual"` only invokes `onSwap` with the message;
      the host decides what to do.
  - `clearFederationContainer(scope)` helper for hosts that hit
    `Container already registered` after a re-key; call it from the
    `onSwap` callback before the addon route re-mounts.
  - `applyHotSwapReload` exported for non-React shells that want to
    drive the policy from a vanilla container.

  **sdk:**
  - `loadFederatedAddon(spec, addonKey, version?)` accepts an optional
    `version` so the loader cache-busts `remoteEntry.js` via
    `?v=<hash8>` when the manifest hash bumps. Cache key includes the
    version so a fresh hash triggers a fresh load instead of returning
    the memoized old container.
  - New `withVersionParam(url, hash)` helper (idempotent, fragment-safe,
    replaces prior `v=` entries) exported for symmetry — the
    runtime-react module re-uses the same algorithm.

  **starter-core:**
  - `<AddonRoute>` accepts a new optional `version?: string` prop. When
    it changes, the route's children are wrapped in a `Fragment` with a
    new `key`, forcing the federation loader to re-evaluate.

  ### Host wire-up (4-5 lines)

  ```tsx
  const ws = useWebSocket()
  useManifestHotSwapSubscriber(ws)                         // metadata cache
  const { addonVersionMap } = useHotSwapReload(ws, { strategy: 'rekey' })
  // …in your router:
  <AddonRoute version={addonVersionMap[addonKey]} shell={renderShell}>
    <AddonLoader scope={addonKey} url={remoteEntryUrl} api={api} />
  </AddonRoute>
  ```

  Re-keying is intentionally destructive: any state inside the addon is
  lost because the code version changed. Hosts that need a confirmation
  gate should pass `onBeforeReload` and prompt the user before the swap
  applies.

- ba60c8f: feat: immersive route wrapper + manifest hot-swap subscriber (RFC-0001 D1 + D4)

  **runtime-react:**
  - `metadata-cache` gains `invalidateAddon(addonKey, matcher?)` and `clearAll()`
    so consumers can flush scoped cache entries when an addon's manifest hash
    changes. The default matcher recognises `addonKey`, `${addonKey}.`,
    `${addonKey}:` and `${addonKey}/` prefixes; hosts that namespace their
    `model` keys differently can pass a custom matcher.
  - New `manifest-hotswap-subscriber` module ships:
    - `ADDON_MANIFEST_CHANGED_TYPE` — the `ws.MessageType` constant the kernel
      emits via `bridge.WSManifestBroadcaster`.
    - `wireHotSwapInvalidation(client, options?)` — imperative helper hosts call
      once at boot. Accepts any object exposing `subscribe(type, handler)`
      (structurally compatible with `useWebSocket().subscribe`), invalidates
      the metadata cache for the bumped addon, and optionally invokes an
      `onSwap` side-effect callback (handy for forcing a `window.location.reload()`
      when the running addon's bundle hash changes, since metadata invalidation
      alone does not swap the federation container already in memory).
    - `useManifestHotSwapSubscriber(client)` — React hook variant for hosts
      that prefer mounting the wire-up next to their WebSocket provider.

  **starter-core:**
  - New `AddonRoute` component closes the host side of RFC-0001 D1 (immersive
    end-to-end). It reads `useAddonLayout()` from runtime-react and either
    renders the addon inside a caller-provided shell renderer (default
    `"shell"` layout) or strips chrome and pins the addon to the viewport
    (`fixed inset-0 z-50`) when the active layout is `"immersive"`. Supports
    both prop-driven layout (no shell flash for always-immersive routes like
    POS / kitchen-display) and context-driven layout (addon calls
    `useDeclareAddonLayout("immersive")` after mount). Cleanup restores
    `"shell"` so navigating away brings the chrome back.

  Together these closures unblock zero-polling hot-swap reloads in the
  metadata layer and let immersive addons own the viewport without each app
  re-implementing the shell branch.

### Patch Changes

- Updated dependencies [9ce8269]
- Updated dependencies [04362f2]
- Updated dependencies [ba60c8f]
  - @asteby/metacore-runtime-react@10.0.0
  - @asteby/metacore-sdk@2.5.0

## 9.0.0

### Patch Changes

- Updated dependencies [150a907]
  - @asteby/metacore-runtime-react@9.2.0

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
