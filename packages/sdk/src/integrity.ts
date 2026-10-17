/**
 * Subresource Integrity (SRI) for federated remotes.
 *
 * `manifest.frontend.integrity` ("sha384-<base64>", written by `metacore build`)
 * pins the bytes of the addon's `remoteEntry.js`. The legacy `<script>` loader
 * ({@link loadFederatedAddon}) sets it on the tag; the Module Federation runtime
 * path (runtime-react `AddonLoader` / `AddonPageLoader`) imports the entry with
 * `import()`, which cannot carry an integrity attribute, so it calls
 * {@link ensureRemoteIntegrity} first:
 *
 *   1. In a browser it injects `<link rel="modulepreload" integrity crossorigin>`
 *      for the exact entry URL and waits for it. The browser verifies the hash
 *      and stores the verified module in its module map, so the later
 *      `import(url)` of the MF runtime reuses it (one download, no window
 *      between check and use).
 *   2. If the preload fails, a diagnostic `fetch` tells a network blip
 *      (retryable) from a hash mismatch ({@link RemoteIntegrityError},
 *      permanent: the host must not mount the remote).
 *   3. Without a DOM (tests, workers) it fetches and hashes with WebCrypto.
 *
 * Chunks the entry imports are content-hashed by name and covered by the
 * hub's bundle signature; SRI pins the entry, the root of that graph.
 */

/** Hash algorithms SRI accepts, strongest first. */
const ALGORITHMS = { sha512: "SHA-512", sha384: "SHA-384", sha256: "SHA-256" } as const;
type SriAlgorithm = keyof typeof ALGORITHMS;

/** Thrown when a remote's bytes do not match its declared integrity. */
export class RemoteIntegrityError extends Error {
  readonly url: string;
  readonly expected: string;
  constructor(url: string, expected: string, actual?: string) {
    super(
      `metacore: integrity check failed for ${url} (expected ${expected}` +
        (actual ? `, got ${actual}` : "") +
        "). The remote was not mounted.",
    );
    this.name = "RemoteIntegrityError";
    this.url = url;
    this.expected = expected;
  }
}

interface ParsedIntegrity {
  algorithm: SriAlgorithm;
  digest: string;
}

/**
 * Parse an SRI metadata string. Multiple space-separated hashes are allowed
 * (the strongest algorithm wins, as in the HTML spec); unknown algorithms are
 * ignored. Returns `[]` when nothing usable is present.
 */
export function parseIntegrity(integrity: string | undefined | null): ParsedIntegrity[] {
  if (!integrity) return [];
  const out: ParsedIntegrity[] = [];
  for (const token of integrity.trim().split(/\s+/)) {
    const m = /^(sha256|sha384|sha512)-([A-Za-z0-9+/=_-]+)(?:\?.*)?$/.exec(token);
    if (m) out.push({ algorithm: m[1] as SriAlgorithm, digest: m[2] });
  }
  const rank = (a: SriAlgorithm) => Object.keys(ALGORITHMS).indexOf(a);
  const best = out.length ? Math.min(...out.map((p) => rank(p.algorithm))) : -1;
  return out.filter((p) => rank(p.algorithm) === best);
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** SRI string (`<alg>-<base64>`) of `data`. Default algorithm `sha384`. */
export async function computeIntegrity(
  data: ArrayBuffer | Uint8Array | string,
  algorithm: SriAlgorithm = "sha384",
): Promise<string> {
  const bytes =
    typeof data === "string"
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);
  const digest = await crypto.subtle.digest(ALGORITHMS[algorithm], bytes as BufferSource);
  return `${algorithm}-${toBase64(new Uint8Array(digest))}`;
}

/** True when `data` matches any of the strongest hashes in `integrity`. */
export async function matchesIntegrity(
  data: ArrayBuffer | Uint8Array | string,
  integrity: string,
): Promise<boolean> {
  const wanted = parseIntegrity(integrity);
  if (wanted.length === 0) return false;
  const actual = await computeIntegrity(data, wanted[0].algorithm);
  const digest = actual.slice(actual.indexOf("-") + 1);
  const norm = (s: string) => s.replace(/-/g, "+").replace(/_/g, "/");
  return wanted.some((w) => norm(w.digest) === digest);
}

async function fetchAndVerify(url: string, integrity: string): Promise<void> {
  // A network failure here is transient (the loader retries it); only a
  // successful download with the wrong bytes is an integrity failure.
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  if (!res.ok) throw new Error(`metacore: remote entry ${url} responded ${res.status}`);
  const body = await res.arrayBuffer();
  if (!(await matchesIntegrity(body, integrity))) {
    const algorithm = parseIntegrity(integrity)[0]?.algorithm ?? "sha384";
    throw new RemoteIntegrityError(url, integrity, await computeIntegrity(body, algorithm));
  }
}

const verified = new Map<string, Promise<void>>();

function canModulePreload(): boolean {
  if (typeof document === "undefined") return false;
  const link = document.createElement("link");
  return !!link.relList?.supports?.("modulepreload");
}

function preloadWithIntegrity(url: string, integrity: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "modulepreload";
    link.href = url;
    link.integrity = integrity;
    // Same-origin by default; anonymous CORS keeps CDN-fronted remotes working
    // (SRI requires a CORS-enabled response for cross-origin URLs).
    link.crossOrigin = "anonymous";
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`metacore: modulepreload failed for ${url}`));
    document.head.appendChild(link);
  });
}

/**
 * Verify a remote entry against its SRI metadata before the MF runtime imports
 * it. No-op when `integrity` is empty (manifests without it keep loading).
 * Memoized per (url, integrity); a failure is not cached so a retry re-checks.
 *
 * Throws {@link RemoteIntegrityError} on a hash mismatch and a plain `Error`
 * (message matches the loader's transient-network pattern) on network failure.
 */
export function ensureRemoteIntegrity(
  url: string,
  integrity: string | undefined | null,
): Promise<void> {
  if (!integrity) return Promise.resolve();
  if (parseIntegrity(integrity).length === 0) {
    return Promise.reject(
      new RemoteIntegrityError(url, integrity, "unsupported integrity metadata"),
    );
  }
  const key = `${url}\n${integrity}`;
  const cached = verified.get(key);
  if (cached) return cached;
  const p = canModulePreload()
    ? preloadWithIntegrity(url, integrity).catch(() => fetchAndVerify(url, integrity))
    : fetchAndVerify(url, integrity);
  verified.set(key, p);
  p.catch(() => verified.delete(key));
  return p;
}

/** Test seam: forget memoized verifications. */
export function __resetRemoteIntegrityCache(): void {
  verified.clear();
}
