/**
 * Federation loader — fetches a remote addon bundle, validates its SRI hash,
 * and initializes its Vite/Webpack module federation container so the host
 * can import it as a normal ES module.
 *
 * Each kernel-enabled addon ships a `remoteEntry.js` + declares in its manifest:
 *
 *   "frontend": {
 *     "entry":     "/api/metacore/addons/tickets/frontend/remoteEntry.js",
 *     "format":    "federation",
 *     "expose":    "./plugin",
 *     "integrity": "sha384-...",
 *     "container": "metacore_tickets"   // optional, inferred from addon key
 *   }
 *
 * The addon's exposed module is expected to default-export a `registerAddon`
 * function (see `Plugin` in ./plugin.ts).
 *
 * ## Naming contract
 *
 * The vite plugin federation build registers the container on
 * `window[<name>]`. If the host and the addon disagree on that name the host
 * will throw `remoteEntry did not register container <X>`. To keep them in
 * lock-step the SDK derives the expected name as:
 *
 *   container = manifest.frontend.container
 *            ?? `metacore_${sanitize(manifest.key)}`
 *
 * so an addon with key `tickets` must build with `name: "metacore_tickets"`.
 * Keys are sanitized (non-alphanumeric → `_`) to yield valid JS identifiers.
 */
import type { FrontendSpec } from "./types.js";
declare global {
    interface Window {
        __METACORE_SHARE_SCOPE__?: Record<string, unknown>;
        [key: string]: unknown;
    }
}
/**
 * Load a federated addon. Returns whatever the addon's exposed module
 * default-exports — typically a `Plugin`. Subsequent calls for the same entry
 * URL are memoized, so safe to call from React render paths.
 *
 * `addonKey` is used to derive the default container name when
 * `spec.container` is not set. Pass the manifest key.
 *
 * When the runtime knows a manifest hash for the addon (e.g. after the
 * hot-swap subscriber observes `ADDON_MANIFEST_CHANGED`), pass it as
 * `version` so the loader cache-busts the `remoteEntry.js` URL via
 * {@link withVersionParam}. The cache key includes the version so a hash
 * bump triggers a fresh load instead of returning the memoized old
 * container. Callers that want to swap the running container should also
 * invoke `clearFederationContainer(scope)` from runtime-react before
 * re-mounting the addon — see runtime-react's `hotswap-reload-policy`.
 */
export declare function loadFederatedAddon(spec: FrontendSpec, addonKey?: string, version?: string): Promise<unknown>;
/**
 * Append a `?v=<hash8>` query string to a `remoteEntry.js` URL so the
 * browser treats it as a distinct resource and bypasses any HTTP / module
 * cache. Idempotent — passing the same hash twice yields the same URL.
 * Preserves existing query params and replaces a prior `v=` entry if one
 * is present, so successive bumps don't accumulate stale parameters.
 *
 * Accepts kernel-format hashes (`sha256:abc...`) and bare hex digests; the
 * function strips the algorithm prefix and lower-cases the first eight
 * hex chars. Returns the URL unchanged if `hash` is falsy.
 *
 * Pure (no `window` access) — safe in SSR.
 */
export declare function withVersionParam(url: string, hash: string | undefined): string;
/**
 * Derive the global container name. Prefers the explicit `container` field
 * on the FrontendSpec, falling back to `metacore_<sanitized_key>`. Throws
 * if neither is resolvable so a misconfigured addon fails fast.
 *
 * Exported for symmetry with callers that want to pre-warm `window[name]`
 * (e.g. server-side-rendered hosts injecting the script tag manually).
 */
export declare function containerName(spec: FrontendSpec, addonKey?: string): string;
//# sourceMappingURL=federation.d.ts.map