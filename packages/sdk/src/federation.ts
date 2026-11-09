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

export interface LoadFederatedAddonOptions {
  /**
   * Rechaza (promesa rechazada) un spec sin `integrity` en vez de cargarlo sin
   * verificar. Pensado para remotos privados. Por omisión `false`: el
   * comportamiento histórico (`integrity` opcional).
   */
  requireIntegrity?: boolean;
  /**
   * Rechaza si el remoto no termina de cargar en este tiempo (ms). Por omisión
   * sin límite, como hasta ahora.
   */
  timeoutMs?: number;
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
export function loadFederatedAddon(
  spec: FrontendSpec,
  addonKey?: string,
  version?: string,
  options?: LoadFederatedAddonOptions,
): Promise<unknown> {
  if (spec.format !== "federation") {
    throw new Error(`loadFederatedAddon: unsupported format ${spec.format}`);
  }
  // Política de integridad: se evalúa ANTES de la caché para que una carga
  // previa sin `integrity` no satisfaga a quien la exige.
  if (options?.requireIntegrity && !spec.integrity) {
    return Promise.reject(
      new Error(
        `metacore: addon ${spec.container ?? addonKey ?? spec.entry} has no frontend.integrity and requireIntegrity is set`,
      ),
    );
  }
  const cacheKey = `${spec.container ?? addonKey ?? ""}::${spec.entry}::${version ?? ""}`;
  let shared = loaded.get(cacheKey);
  if (!shared) {
    const created = doLoad(spec, addonKey, version);
    shared = created;
    loaded.set(cacheKey, created);
    created.catch(() => {
      if (loaded.get(cacheKey) === created) loaded.delete(cacheKey);
    });
  }
  const ms = options?.timeoutMs;
  if (!ms || ms <= 0) return shared;
  // El timeout envuelve la promesa compartida (no la contamina) y, al vencer,
  // libera la caché para que un reintento vuelva a intentar la carga.
  const pending = shared;
  return new Promise<unknown>((resolve, reject) => {
    const t = setTimeout(() => {
      if (loaded.get(cacheKey) === pending) loaded.delete(cacheKey);
      reject(
        new Error(
          `metacore: addon ${spec.container ?? addonKey ?? spec.entry} did not load within ${ms} ms`,
        ),
      );
    }, ms);
    pending.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function doLoad(
  spec: FrontendSpec,
  addonKey?: string,
  version?: string,
): Promise<unknown> {
  const globalName = containerName(spec, addonKey);
  if (!window[globalName]) {
    const url = withVersionParam(spec.entry, version);
    await injectScript(url, spec.integrity);
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
export function withVersionParam(
  url: string,
  hash: string | undefined,
): string {
  if (!hash) return url;
  const short = shortenHash(hash);
  if (!short) return url;
  const hashIdx = url.indexOf("#");
  const fragment = hashIdx >= 0 ? url.slice(hashIdx) : "";
  const base = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
  const qIdx = base.indexOf("?");
  if (qIdx < 0) return `${base}?v=${short}${fragment}`;
  const head = base.slice(0, qIdx);
  const query = base.slice(qIdx + 1);
  const parts = query
    .split("&")
    .filter((p) => p.length > 0 && !p.startsWith("v="));
  parts.push(`v=${short}`);
  return `${head}?${parts.join("&")}${fragment}`;
}

function shortenHash(hash: string): string | undefined {
  const colonIdx = hash.indexOf(":");
  const digest = colonIdx >= 0 ? hash.slice(colonIdx + 1) : hash;
  const trimmed = digest.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 8).toLowerCase();
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
