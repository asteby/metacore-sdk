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
 */
export declare function loadFederatedAddon(spec: FrontendSpec, addonKey?: string): Promise<unknown>;
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