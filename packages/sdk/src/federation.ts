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

type FederationContainer = {
  init(scope: Record<string, unknown>): Promise<void>;
  get(module: string): Promise<() => { default: unknown }>;
};

declare global {
  interface Window {
    __METACORE_SHARE_SCOPE__?: Record<string, unknown>;
    [key: string]: unknown;
  }
}

const loaded = new Map<string, Promise<unknown>>();

/**
 * Load a federated addon. Returns whatever the addon's exposed module
 * default-exports — typically a `Plugin`. Subsequent calls for the same entry
 * URL are memoized, so safe to call from React render paths.
 *
 * `addonKey` is used to derive the default container name when
 * `spec.container` is not set. Pass the manifest key.
 */
export function loadFederatedAddon(
  spec: FrontendSpec,
  addonKey?: string,
): Promise<unknown> {
  if (spec.format !== "federation") {
    throw new Error(`loadFederatedAddon: unsupported format ${spec.format}`);
  }
  const cacheKey = `${spec.container ?? addonKey ?? ""}::${spec.entry}`;
  const cached = loaded.get(cacheKey);
  if (cached) return cached;
  const p = doLoad(spec, addonKey);
  loaded.set(cacheKey, p);
  p.catch(() => loaded.delete(cacheKey));
  return p;
}

async function doLoad(spec: FrontendSpec, addonKey?: string): Promise<unknown> {
  const globalName = containerName(spec, addonKey);
  if (!window[globalName]) {
    await injectScript(spec.entry, spec.integrity);
  }
  const container = window[globalName] as FederationContainer | undefined;
  if (!container) {
    throw new Error(
      `metacore: remoteEntry at ${spec.entry} did not register container ${globalName}`,
    );
  }
  window.__METACORE_SHARE_SCOPE__ ??= {};
  await container.init(window.__METACORE_SHARE_SCOPE__);
  const factory = await container.get(spec.expose ?? "./plugin");
  const mod = factory() as { default: unknown };
  return mod.default;
}

function injectScript(url: string, integrity?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = url;
    s.async = true;
    // Federation scripts are served from the same origin as the host API
    // (see backend `GET /api/metacore/addons/:key/frontend/*path`), so CORS
    // is implicit. `crossorigin` stays anonymous in case the deployment
    // fronts them through a CDN with permissive CORS.
    s.crossOrigin = "anonymous";
    if (integrity) s.integrity = integrity;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`metacore: failed to load ${url}`));
    document.head.appendChild(s);
  });
}

/**
 * Derive the global container name. Prefers the explicit `container` field
 * on the FrontendSpec, falling back to `metacore_<sanitized_key>`. Throws
 * if neither is resolvable so a misconfigured addon fails fast.
 *
 * Exported for symmetry with callers that want to pre-warm `window[name]`
 * (e.g. server-side-rendered hosts injecting the script tag manually).
 */
export function containerName(spec: FrontendSpec, addonKey?: string): string {
  if (spec.container && spec.container.length > 0) {
    return spec.container;
  }
  if (!addonKey) {
    throw new Error(
      "metacore: cannot derive federation container name — " +
        "provide manifest.frontend.container or pass the addon key",
    );
  }
  const safe = addonKey.replace(/[^a-zA-Z0-9]/g, "_");
  return `metacore_${safe}`;
}
