---
'@asteby/metacore-runtime-react': minor
'@asteby/metacore-starter-core': minor
'@asteby/metacore-sdk': minor
---

feat: hot-swap reload policy (RFC-0001 D4 close)

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
