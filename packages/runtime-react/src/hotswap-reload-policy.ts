// hotswap-reload-policy — closes the last piece of RFC-0001 D4 ("zero-polling
// hot-swap") on the client. The {@link useManifestHotSwapSubscriber} hook
// already invalidates the metadata cache when the kernel announces a manifest
// change, but the federation container of an already-mounted addon keeps the
// old code in memory. This module picks one of three policies for forcing the
// new code to take effect:
//
//   1. `"rekey"` — the default, **recommended for most apps**. Maintains a
//      reactive map `addonKey → hashShort` that the host wires into
//      `<AddonRoute version={...} />`. When a swap arrives, the hash flips,
//      React unmounts and remounts the addon subtree, which causes the
//      federation loader to re-fetch `remoteEntry.js` (cache-busted via
//      {@link withVersionParam}) and re-evaluate the exposed module. State
//      inside the addon is lost — **intentional**, because the code version
//      changed and stale closures over old props/state would be a footgun.
//
//   2. `"page-reload"` — `window.location.reload()`. Opt-in escape hatch
//      for immersive addons with critical state (POS with an order in
//      progress, kitchen-display with partial confirmations). Pair with
//      `onBeforeReload` to surface an "unsaved changes" prompt before
//      blowing the page away. Returning `false` from `onBeforeReload`
//      cancels the reload.
//
//   3. `"manual"` — the hook only invokes the host-provided `onSwap`
//      callback. The host decides what to do (e.g. show a toast: "New
//      version available — reload when ready"). No automatic remount, no
//      reload. The `addonVersionMap` is still updated so a host that wires
//      `<AddonRoute version=...>` later in the lifecycle picks up the new
//      hash on demand.
//
// ## Wiring example
//
// ```tsx
// // Host shell (4-5 line wire-up):
// const ws = useWebSocket()
// useManifestHotSwapSubscriber(ws)                      // invalidates metadata
// const { addonVersionMap } = useHotSwapReload({ strategy: "rekey" })
// // …in your router:
// <AddonRoute version={addonVersionMap[addonKey]} shell={renderShell}>
//   <AddonLoader scope={addonKey} url={remoteEntryUrl} api={api} />
// </AddonRoute>
// ```
//
// ## Federation runtime caveat
//
// The `"rekey"` strategy re-fetches `remoteEntry.js` with a `?v=<hash8>` query
// suffix (see {@link withVersionParam}). For the new container to replace the
// old one, the federation loader **must** `delete window[Container]` before
// loading the new script — otherwise the cached container object short-
// circuits the loader and you get `Container already registered` style errors
// or, worse, the old code silently keeps running. This module exports
// {@link clearFederationContainer} for that purpose; the host's federation
// loader should call it from its `onSwap` hook.
//
// We deliberately keep the `delete window[Container]` side-effect OUT of this
// module's default behaviour. Some federation runtimes (vite-plugin-federation
// in dev, webpack 5 with `runtime: false`) wrap the container in a `Proxy`
// that mutates internal state on every access; blindly deleting it from
// here would race against any unmounting consumer that still holds a
// reference. Hosts that hit `Container already registered` should call
// `clearFederationContainer(scope)` from `onSwap` as documented below.

import { useMemo, useRef, useState } from 'react'
import {
    useManifestHotSwapSubscriber,
    type AddonManifestChangedMessage,
    type ManifestHotSwapClient,
    type WireHotSwapInvalidationOptions,
} from './manifest-hotswap-subscriber'

/**
 * One of three strategies for reacting to an `ADDON_MANIFEST_CHANGED` event:
 *
 *   * `"rekey"` — re-mount the addon route by flipping the key. Default.
 *   * `"page-reload"` — `window.location.reload()`. Opt-in.
 *   * `"manual"` — no automatic action; the host handles it via `onSwap`.
 */
export type HotSwapReloadStrategy = 'rekey' | 'page-reload' | 'manual'

/**
 * Config for {@link useHotSwapReload}. `strategy` is the only required field
 * — pass `{ strategy: "rekey" }` for the default behaviour or omit the
 * config entirely.
 */
export interface HotSwapReloadConfig {
    /** Reload policy. See {@link HotSwapReloadStrategy}. */
    strategy?: HotSwapReloadStrategy
    /**
     * Optional gate invoked **before** the reload action fires. Return
     * `false` (or a Promise resolving to `false`) to cancel — useful for
     * "unsaved changes" prompts on immersive addons. Receives the original
     * `ADDON_MANIFEST_CHANGED` message so the prompt can name the addon.
     *
     * Runs for `"page-reload"` (cancels the `window.location.reload()`)
     * and `"rekey"` (cancels the version bump, leaving the addon mounted
     * with the old code — the host can re-trigger the swap later by
     * re-calling the hook output's `reload()` method).
     *
     * Ignored for `"manual"` — the host owns the reload there.
     */
    onBeforeReload?: (
        event: AddonManifestChangedMessage,
    ) => boolean | Promise<boolean>
    /**
     * Side-effect hook invoked after the policy has run (or after
     * `onBeforeReload` returned `false`). Receives the message and the
     * effective action that was taken: `"rekey"`, `"page-reload"`,
     * `"cancelled"` or `"manual"`. Hosts wire telemetry / toasts here.
     */
    onSwap?: (
        event: AddonManifestChangedMessage,
        action: 'rekey' | 'page-reload' | 'cancelled' | 'manual',
    ) => void
    /**
     * Optional matcher forwarded to the underlying
     * {@link useManifestHotSwapSubscriber} for cache invalidation.
     */
    matcher?: WireHotSwapInvalidationOptions['matcher']
}

export interface UseHotSwapReloadResult {
    /**
     * Reactive map `addonKey → hashShort`. Stable identity per render
     * (only changes when a swap lands). Wire it into
     * `<AddonRoute version={addonVersionMap[addonKey]} ... />` so React
     * re-keys the subtree on hash change.
     *
     * Missing entries return `undefined`; the AddonRoute treats that as
     * "no version pinned yet" and keeps a stable key.
     */
    addonVersionMap: Record<string, string>
}

/**
 * Subscribe to manifest hot-swap events and apply a reload policy.
 *
 * **Strategy = `"rekey"` (default):**
 *   maintains `addonVersionMap` so `<AddonRoute version=...>` re-keys
 *   the subtree on every swap. The federation loader picks the new hash
 *   up via {@link withVersionParam}, fetches a fresh `remoteEntry.js`,
 *   and registers a new container.
 *
 * **Strategy = `"page-reload"` (opt-in):**
 *   calls `onBeforeReload` (if supplied); if it resolves truthy,
 *   `window.location.reload()` fires. The `addonVersionMap` is still
 *   updated for callers that want to mirror it elsewhere.
 *
 * **Strategy = `"manual"`:**
 *   no automatic action. The `onSwap` callback fires with `"manual"`;
 *   the host decides what to do. `addonVersionMap` is updated so a
 *   later opt-in remount picks up the right hash.
 *
 * @example
 *   const ws = useWebSocket()
 *   useManifestHotSwapSubscriber(ws) // invalidates metadata cache
 *   const { addonVersionMap } = useHotSwapReload({ strategy: 'rekey' })
 *   // …in your router:
 *   <AddonRoute version={addonVersionMap[addonKey]}>
 *     <AddonLoader scope={addonKey} url={url} api={api} />
 *   </AddonRoute>
 */
/**
 * Effect that {@link applyHotSwapReload} can take. Useful as a discriminator
 * for tests and telemetry callbacks. `"noop"` is emitted when a malformed
 * message is ignored (e.g. missing `addonKey`).
 */
export type HotSwapReloadAction =
    | 'rekey'
    | 'page-reload'
    | 'cancelled'
    | 'manual'
    | 'noop'

export interface HotSwapReloadDeps {
    /** Hash → versionMap setter. Receives an updater fn, à la React state. */
    setVersionMap: (
        updater: (prev: Record<string, string>) => Record<string, string>,
    ) => void
    /** Defaults to `window.location.reload`. Overridable for tests / SSR. */
    reload?: () => void
}

/**
 * Pure (testable) implementation of the swap handler. Decides the action
 * given a message + config + deps, applies side effects via `deps`, and
 * returns the action it took so callers can fire telemetry.
 *
 * Exported for unit tests; the React hook below composes it with React
 * state. Hosts that want to drive the policy from a non-React context
 * (e.g. a vanilla web component shell) can call this directly.
 */
export async function applyHotSwapReload(
    message: AddonManifestChangedMessage,
    config: HotSwapReloadConfig,
    deps: HotSwapReloadDeps,
): Promise<HotSwapReloadAction> {
    const strategy: HotSwapReloadStrategy = config.strategy ?? 'rekey'
    const addonKey = message.payload?.addonKey
    if (!addonKey) return 'noop'
    const shortHash = shortenHash(message.payload?.newHash)

    if (strategy === 'manual') {
        if (shortHash) {
            deps.setVersionMap((m) => ({ ...m, [addonKey]: shortHash }))
        }
        config.onSwap?.(message, 'manual')
        return 'manual'
    }

    if (config.onBeforeReload) {
        const proceed = await Promise.resolve(config.onBeforeReload(message))
        if (!proceed) {
            config.onSwap?.(message, 'cancelled')
            return 'cancelled'
        }
    }

    if (strategy === 'page-reload') {
        config.onSwap?.(message, 'page-reload')
        const reload =
            deps.reload ??
            (typeof window !== 'undefined'
                ? () => window.location.reload()
                : undefined)
        if (reload) {
            // Defer so any setState before us commits before we tear down.
            queueMicrotask(reload)
        }
        return 'page-reload'
    }

    // strategy === "rekey"
    if (shortHash) {
        deps.setVersionMap((m) => {
            if (m[addonKey] === shortHash) return m
            return { ...m, [addonKey]: shortHash }
        })
    }
    config.onSwap?.(message, 'rekey')
    return 'rekey'
}

export function useHotSwapReload(
    client: ManifestHotSwapClient | undefined | null,
    config: HotSwapReloadConfig = {},
): UseHotSwapReloadResult {
    const [addonVersionMap, setAddonVersionMap] = useState<
        Record<string, string>
    >({})

    // Keep config behind a ref so changing callbacks between renders does
    // not re-subscribe to the WebSocket / tear down listeners.
    const configRef = useRef(config)
    configRef.current = config

    // Stable handler for the underlying subscriber — reads the latest
    // config out of the ref every time the WS emits.
    const handleSwap = useMemo(
        () => (message: AddonManifestChangedMessage) => {
            void applyHotSwapReload(message, configRef.current, {
                setVersionMap: setAddonVersionMap,
            })
        },
        [],
    )

    useManifestHotSwapSubscriber(client, {
        matcher: config.matcher,
        onSwap: handleSwap,
    })

    return { addonVersionMap }
}

/**
 * Append a `?v=<hash8>` query string to a `remoteEntry.js` URL so the
 * browser treats it as a distinct resource and bypasses any HTTP / module
 * cache. Idempotent — calling twice with the same hash returns the same
 * URL. Preserves existing query params; replaces a previous `v=` entry if
 * present so successive bumps don't accumulate stale parameters.
 *
 * Pure function (no `window` access) — safe to call in SSR.
 *
 * @example
 *   withVersionParam('/api/addons/pos/frontend/remoteEntry.js', 'abc123ef')
 *   // → '/api/addons/pos/frontend/remoteEntry.js?v=abc123ef'
 *
 *   withVersionParam('/r.js?foo=1', 'abc123ef')
 *   // → '/r.js?foo=1&v=abc123ef'
 *
 *   withVersionParam('/r.js?v=oldhash', 'abc123ef')
 *   // → '/r.js?v=abc123ef'
 */
export function withVersionParam(url: string, hash: string | undefined): string {
    if (!hash) return url
    const short = shortenHash(hash)
    if (!short) return url
    const hashIdx = url.indexOf('#')
    const fragment = hashIdx >= 0 ? url.slice(hashIdx) : ''
    const base = hashIdx >= 0 ? url.slice(0, hashIdx) : url
    const qIdx = base.indexOf('?')
    if (qIdx < 0) return `${base}?v=${short}${fragment}`
    const head = base.slice(0, qIdx)
    const query = base.slice(qIdx + 1)
    // Drop any previous v= entry and re-append.
    const parts = query
        .split('&')
        .filter((p) => p.length > 0 && !p.startsWith('v='))
    parts.push(`v=${short}`)
    return `${head}?${parts.join('&')}${fragment}`
}

/**
 * Remove the federation container previously registered on `window[scope]`.
 * Hosts call this from `onSwap` before letting the addon route re-mount
 * so the next `remoteEntry.js` injection creates a fresh container instead
 * of short-circuiting on the cached one.
 *
 * Best-effort: if `window` is undefined (SSR) or the scope was never
 * registered, this is a no-op. Returns `true` if a container was actually
 * removed, `false` otherwise — useful for telemetry.
 *
 * **Caveat:** some federation runtimes wrap the container in a Proxy
 * whose internal state survives `delete`. If you hit `Container already
 * registered` after calling this, the federation runtime is holding the
 * reference internally and the only reliable swap is `"page-reload"`.
 */
export function clearFederationContainer(scope: string): boolean {
    if (typeof window === 'undefined') return false
    if (!(scope in window)) return false
    try {
        delete (window as Record<string, unknown>)[scope]
        return true
    } catch {
        // Some browsers refuse to delete non-configurable globals. Set
        // to undefined as a fallback so the loader's `if (!window[scope])`
        // check still triggers a re-inject.
        ;(window as Record<string, unknown>)[scope] = undefined
        return true
    }
}

/**
 * Normalise a manifest hash for cache-busting. Accepts the full kernel
 * format (`sha256:abc...`), a bare hex digest, or `undefined`. Returns
 * an 8-character lowercase prefix that's short enough to keep URLs
 * readable while remaining collision-resistant across realistic addon
 * versioning timelines.
 *
 * Exported for tests; hosts that want the full hash for their own
 * telemetry should read `message.payload.newHash` directly.
 */
export function shortenHash(hash: string | undefined): string | undefined {
    if (!hash) return undefined
    const colonIdx = hash.indexOf(':')
    const digest = colonIdx >= 0 ? hash.slice(colonIdx + 1) : hash
    const trimmed = digest.trim()
    if (!trimmed) return undefined
    return trimmed.slice(0, 8).toLowerCase()
}
