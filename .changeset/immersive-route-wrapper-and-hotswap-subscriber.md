---
'@asteby/metacore-runtime-react': minor
'@asteby/metacore-starter-core': minor
---

feat: immersive route wrapper + manifest hot-swap subscriber (RFC-0001 D1 + D4)

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
