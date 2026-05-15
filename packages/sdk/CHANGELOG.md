# @asteby/metacore-sdk

## 2.6.0

### Minor Changes

- dee623a: docs: documenting `ModalProps.payload` widening and federation canonical helper.

  Two contract changes that existed in code but had no docs:
  1. **`ModalProps.payload` widening.** `packages/sdk/src/registry.ts` declares
     `payload: Record<string, unknown>` — the registry holds modals from any
     addon, so the typed shape cannot survive contravariance. Addons that used
     to declare a narrow `payload: { ticketId }` directly on the prop type need
     to switch to the **narrow-at-entry** pattern: type the component as
     `ModalProps`, then `const { ticketId } = props.payload as unknown as MyPayload`
     inside the body. The runtime contract is unchanged. See the new
     [`docs/modals.md`](https://github.com/asteby/metacore-sdk/blob/main/docs/modals.md)
     and the new "Modals" section in `packages/sdk/README.md`.
  2. **`metacoreFederationShared()` is the canonical federation helper.**
     `@originjs/vite-plugin-federation` >= 1.4 dropped `singleton` from its
     public `SharedConfig` TypeScript type (the runtime still honours the
     field). Any addon authoring a `shared:` block against the plugin's own
     type will fail to typecheck on the next bump. The new
     [`docs/federation.md`](https://github.com/asteby/metacore-sdk/blob/main/docs/federation.md)
     promotes `metacoreFederationShared()` from `@asteby/metacore-starter-config/vite`
     as the **only** documented way to wire federation, with a worked sample,
     a warning against the plugin's direct type, and a fallback for the rare
     case where the helper does not fit. The starter-config README links to
     it, and the `addon-cookbook.md` "How do I bundle a frontend extension"
     recipe + the `full-page-federation.md` sample now use the helper instead
     of the legacy inline `shared:` array.

  No runtime or public type changes — docs only.

### Patch Changes

- 56d2013: feat(marketplace): expand `CatalogAddon` and `AddonVersion` with the
  fields the hub catalog UI needs to render version selectors, install
  gates, and entitlement state.

  All new fields are optional so existing consumers keep compiling
  unchanged.

  Added to `AddonVersion`:
  - `changelog?: string` — per-version release notes (markdown).
  - `review_status?: AddonVersionReviewStatus` — `"pending" | "approved" |
"rejected" | "scan_failed" | "deprecated"`, used to badge versions
    in the version selector. Also exported as a named type.

  Added to `CatalogAddon`:
  - `installable?: boolean` — server-side gate, used to disable the
    install button when the hub already knows the install would fail
    (ABI mismatch, region block, publisher suspended, etc.).
  - `entitled?: boolean` — whether the caller's tenant already holds a
    valid licence for this addon. Drives the "Install" vs "Buy" /
    "Upgrade plan" branch in the UI.
  - `reason?: string` — human-readable explanation when `installable`
    or `entitled` is `false` ("License required", "Upgrade to Pro",
    "Requires kernel ≥ 1.4", etc.).

  These fields are populated by the hub from
  `GET /v1/catalog/addons[/{key}]` and
  `GET /v1/catalog/addons/{key}/versions`; see the JSDoc on each field
  for the exact semantics.

- 1c4a108: feat(marketplace): phase 2 — add `tags`, `screenshots`, `maintainer`,
  `pricing`, kernel-compat range, artifact size, and signing identity to
  the marketplace types.

  Follow-up to the phase-1 expansion that added `installable` /
  `entitled` / `reason` / `changelog` / `review_status`. All new fields
  are optional so existing consumers keep compiling unchanged.

  Added to `AddonVersion`:
  - `min_kernel_version?: string` / `max_kernel_version?: string` —
    inclusive semver bounds, used by the catalog UI to pre-filter
    selectable versions client-side without waiting on the server-side
    `installable` gate.
  - `size_bytes?: number` — raw artifact size, surfaced as "Downloads
    2.3 MB" in the install confirmation dialog.
  - `signed_by?: SigningInfo` — signing-key identity (`fingerprint`,
    optional `key_id`) so the UI can render "Signed by …" provenance.
    Verification of the signature itself remains a kernel-side concern.

  Added to `CatalogAddon`:
  - `tags?: string[]` — free-form keyword tags complementing the single
    `category` for filtering and search.
  - `screenshots?: Array<{ url: string; alt?: string }>` — detail-page
    gallery. Objects (not bare URLs) so we can extend with a11y / lazy-
    load metadata without breaking the wire format.
  - `maintainer?: MaintainerInfo` — publisher display info (`name`,
    optional `url` / `email` / `verified`), preferred over the
    manifest's `author` / `website` for catalog UX. `verified` matches
    the developer-account flag on the hub.
  - `pricing?: PricingInfo` — marketing-level price summary
    (`model: "free" | "one_time" | "subscription"`, `price_cents`,
    `currency`, `trial_days`), so the catalog card can render a price
    tag without a second round-trip to the billing service.

  New named types: `MaintainerInfo`, `PricingInfo`, `PricingModel`,
  `SigningInfo`.

  These fields are populated by the hub from
  `GET /v1/catalog/addons[/{key}]` and
  `GET /v1/catalog/addons/{key}/versions`; see the JSDoc on each field
  for the exact semantics.

- 3a3ea4b: fix: unify slot priority ordering across SDK and runtime-react (was
  inconsistent — DESC is now canonical, see `docs/slot-priority.md`).

  `Registry.registerSlot` in `@asteby/metacore-sdk` sorted ascending
  ("lower renders first") while `slotRegistry` in
  `@asteby/metacore-runtime-react` sorted descending ("higher renders
  first"). The runtime-react behaviour matches `docs/dynamic-ui.md`,
  `mergeNavigation` and every other priority sort in the codebase, so the
  SDK has been flipped to match. Addons that register a single
  contribution per slot — i.e. every in-tree consumer we audited — are
  unaffected. Addons relying on the inverted SDK order will need to swap
  their priority values.

## 2.5.0

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

- 04362f2: feat: immersive layout, federation shared-deps helper polish, wasm client

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

## 2.4.0

### Minor Changes

- ec9ad56: feat(sdk): regenerar tipos TS del manifest para reflejar nuevos campos en `ColumnDef`, `RelationDef` y `ActionDef.Trigger`.
  - `ColumnDef` extendido con `visibility?` (`"table"|"modal"|"list"|"all"`), `searchable?`, `validation?` (regex/min/max/custom) y `widget?`. Nuevo `ValidationRule`. Backwards compat: zero-value mantiene el comportamiento actual.
  - Nuevo `RelationDef` (`kind: "one_to_many"|"many_to_many"`, `through`, `foreign_key`, `references?`, `pivot?`, `name`) y campo `relations?: RelationDef[]` en `ModelDefinition`.
  - Nuevo `ActionTrigger` (`type: "wasm"|"webhook"|"noop"`, `export?`, `run_in_tx?`) y campo `trigger?: ActionTrigger` en `ActionDef`. Nil = comportamiento legacy webhook.

  Cambios mecánicos:
  - `packages/sdk/src/generated/manifest.ts`: regenerado vía `pnpm codegen`.
  - `packages/sdk/src/types.ts`: re-export añadido para `ActionTrigger`, `ValidationRule`, `RelationDef`.

  No breaking. Apps consumidoras que no lean los campos nuevos no requieren cambios. Apps Fase 2 (runtime-react `dynamic-table`/`dynamic-form`) los empezarán a consumir en PRs siguientes.

## 2.3.0

### Minor Changes

- c91d778: Export marketplace types via new `@asteby/metacore-sdk/marketplace` sub-path. Adds CatalogAddon, AddonDetail, AddonVersion (hub catalog shapes) and re-exports the manifest types so hub/landing and hub/frontend stop redeclaring them.

## 2.2.0

### Minor Changes

- e23eede: Publicación inicial a npm del ecosistema metacore.

  Propaga los 13 paquetes del SDK al registry público para que las host applications consumidoras migren de `file:` a semver y Renovate pueda propagar updates.

## 2.1.0

### Minor Changes

- Manifest types ahora se generan desde Go via tygo. Fuente: pkg/manifest/manifest.go.
- 6d243b0: Initial release of the metacore frontend ecosystem.

  11 packages extracted from host application frontends into a publishable monorepo with auto-propagation via Changesets + Renovate.
