// manifest-hotswap-subscriber — client-side closure of RFC-0001 D4.
//
// The kernel installer (see metacore-kernel/installer/broadcaster.go) emits a
// WebSocket message every time it observes a manifest-hash change at persist
// time. The bridge (metacore-kernel/bridge/installer_broadcaster.go) fans it
// out per-org over `ws.Hub.SendToUsers` with this exact envelope:
//
//   {
//     "type": "ADDON_MANIFEST_CHANGED",
//     "payload": {
//       "orgId": "<uuid>",
//       "addonKey": "kitchen_display",
//       "oldHash": "sha256:...",
//       "newHash": "sha256:...",
//       "version": "1.2.0",
//       "timestamp": "2026-05-11T12:34:56Z"
//     }
//   }
//
// (The original RFC scratchpad used snake_case keys; the bridge canonicalised
// them to camelCase so the SDK's metadata-cache reducer can consume the
// payload verbatim. This module matches the bridge — the source of truth.)
//
// This module wires the message into `useMetadataCache().invalidateAddon` so
// every cached table/modal metadata entry belonging to the bumped addon is
// dropped from the zustand store. The next mount of any `DynamicTable` or
// `DynamicCRUDPage` will refetch fresh metadata, picking up whatever the
// new manifest changed (new fields, renamed actions, dropped relations…).
//
// IMPORTANT — a freshly-bumped addon whose `remoteEntry.js` URL changes will
// also need its federation container reloaded. Cache invalidation handles
// metadata; it does NOT swap the JS already executing in memory. If your
// host wants the new code to take effect immediately, either:
//
//   1. force a full `window.location.reload()` when an `addon:manifest:changed`
//      event arrives for the addon currently mounted, or
//   2. for immersive addons (`layout: "immersive"`) where users tolerate a
//      flicker, key the addon route component on `newHash` so React unmounts
//      and remounts the AddonLoader with the new remoteEntry URL.
//
// The subscriber here intentionally stops at metadata-cache: deciding when
// to reload is a host policy decision and we keep this module side-effect
// free beyond the cache.

import { useEffect } from 'react'
import { useMetadataCache, type AddonKeyMatcher } from './metadata-cache'

/**
 * `type` string the kernel/bridge emits. Exported so consumers can subscribe
 * manually if they prefer to skip the hook/wire helper. Matches
 * `bridge.WSManifestChangedType` in metacore-kernel.
 */
export const ADDON_MANIFEST_CHANGED_TYPE = 'ADDON_MANIFEST_CHANGED' as const

/**
 * Shape of the WebSocket message the kernel emits. The keys mirror the
 * `bridge.manifestChangedPayload` map in metacore-kernel/bridge — keep them
 * in sync if the bridge ever evolves.
 */
export interface AddonManifestChangedMessage {
    type: typeof ADDON_MANIFEST_CHANGED_TYPE
    payload: {
        orgId?: string
        addonKey: string
        oldHash?: string
        newHash?: string
        version?: string
        timestamp?: string
    }
}

/**
 * Structural client contract. The SDK's `@asteby/metacore-websocket`
 * provider exposes `subscribe(type, handler)` (see `useWebSocket().subscribe`)
 * that satisfies this interface — but any object with a compatible method
 * works, so hosts that wrap their own transport (link's MQTT bridge, the
 * kitchen-display ZeroMQ stub, …) can plug in without depending on the
 * SDK websocket package.
 */
export interface ManifestHotSwapClient {
    subscribe: (
        type: string,
        handler: (message: AddonManifestChangedMessage) => void,
    ) => () => void
}

export interface WireHotSwapInvalidationOptions {
    /**
     * Optional matcher overriding the default cache-key heuristic
     * (see `defaultAddonKeyMatcher`). Hosts that namespace cached
     * `model` keys under prefixes other than `${addonKey}.|:|/` should
     * supply one.
     */
    matcher?: AddonKeyMatcher
    /**
     * Optional side-effect hook invoked after the cache invalidation.
     * Useful for hosts that want to log/observe hot-swaps or trigger a
     * `window.location.reload()` when the running addon's bundle hash
     * changes (see the module-level comment above for the trade-off).
     * `removed` is the number of cache entries flushed for this addon.
     */
    onSwap?: (msg: AddonManifestChangedMessage, removed: number) => void
}

/**
 * Imperative wire-up — no React required. Hosts that own a long-lived
 * WebSocket client (link, ops, the kitchen-display Tauri shell) call this
 * once at boot, after the client has been created. The returned function
 * unsubscribes; most hosts will never call it because the subscription
 * lives for the lifetime of the app.
 *
 *   const ws = createWebSocket(...)
 *   const unsubscribe = wireHotSwapInvalidation(ws)
 *   // …later, if needed:
 *   unsubscribe()
 *
 * Accepts `undefined` so the call site does not need to branch when the
 * client is constructed lazily — it returns a no-op unsubscribe.
 */
export function wireHotSwapInvalidation(
    client: ManifestHotSwapClient | undefined | null,
    options: WireHotSwapInvalidationOptions = {},
): () => void {
    if (!client) return () => {}
    const { matcher, onSwap } = options
    const unsubscribe = client.subscribe(
        ADDON_MANIFEST_CHANGED_TYPE,
        (message) => {
            const addonKey = message?.payload?.addonKey
            if (!addonKey) return
            const removed = useMetadataCache
                .getState()
                .invalidateAddon(addonKey, matcher)
            onSwap?.(message, removed)
        },
    )
    return unsubscribe
}

/**
 * React-flavoured wrapper around {@link wireHotSwapInvalidation}. Mount it
 * once high in the tree (typically next to the WebSocket provider) so the
 * subscription lifetime matches the host shell. Passing `undefined` for
 * the client is supported — the hook becomes a no-op until a real client
 * is available, mirroring how `useWebSocket().subscribe` behaves before
 * the socket opens.
 *
 *   function HostShell() {
 *     const ws = useWebSocket()
 *     useManifestHotSwapSubscriber(ws)
 *     return <Outlet />
 *   }
 */
export function useManifestHotSwapSubscriber(
    client: ManifestHotSwapClient | undefined | null,
    options: WireHotSwapInvalidationOptions = {},
): void {
    const { matcher, onSwap } = options
    useEffect(() => {
        if (!client) return
        const unsubscribe = wireHotSwapInvalidation(client, { matcher, onSwap })
        return unsubscribe
    }, [client, matcher, onSwap])
}
