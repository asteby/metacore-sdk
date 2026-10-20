/**
 * MarketplaceClient — transport-agnostic SDK for the host's marketplace API.
 * Mirrors the REST surface every kernel-consuming app exposes under
 * `/api/metacore/*`. Swap the `fetcher` to run against any host or a mock.
 */

// The host serves the kernel's runtime (legacy/flat) manifest projection —
// `key`/`version`/`frontend` at the top level, NOT the v3 authoring contract.
// We alias LegacyManifest to Manifest locally so the runtime-facing client API
// keeps the shape the host actually returns while the SDK's canonical authoring
// type (./types.js Manifest) is the v3 contract.
import type { LegacyManifest as Manifest, Installation, NavGroup } from "./types.js";
import { epochFromHeaders, observeCacheEpoch, withStaleRetry } from "./cache-epoch.js";

export interface Fetcher {
  <T>(path: string, init?: RequestInit): Promise<T>;
}

export interface ClientOptions {
  baseUrl: string;
  /** Called for every request to inject auth headers, tenant scoping, etc. */
  headers?: () => Record<string, string>;
  /** Override for tests or edge runtimes. */
  fetch?: typeof fetch;
}

export class MarketplaceClient {
  private readonly opts: ClientOptions;

  constructor(opts: ClientOptions) {
    this.opts = opts;
  }

  // ----- catalog -----

  catalog(): Promise<CatalogEntry[]> {
    return this.get("/catalog");
  }

  detail(key: string): Promise<CatalogEntry> {
    return this.get(`/catalog/${encodeURIComponent(key)}`);
  }

  // ----- installations -----

  installed(): Promise<Installation[]> {
    return this.get("/installations");
  }

  install(key: string, payload: InstallPayload = {}): Promise<Installation> {
    return this.post(`/installations/${encodeURIComponent(key)}`, payload);
  }

  enable(key: string): Promise<Installation> {
    return this.post(`/installations/${encodeURIComponent(key)}/enable`);
  }

  disable(key: string): Promise<Installation> {
    return this.post(`/installations/${encodeURIComponent(key)}/disable`);
  }

  uninstall(key: string, dropData = false): Promise<void> {
    return this.del(`/installations/${encodeURIComponent(key)}?drop=${dropData}`);
  }

  updateSettings(key: string, settings: Record<string, unknown>): Promise<Installation> {
    return this.post(`/installations/${encodeURIComponent(key)}/settings`, settings);
  }

  // ----- navigation & manifests (used by the shell) -----

  navigation(): Promise<NavGroup[]> {
    return this.get("/navigation");
  }

  manifests(): Promise<Manifest[]> {
    return this.get("/manifests");
  }

  /** Shell-oriented manifests (no columns/actions/i18n). Hosts SHOULD use this. */
  manifestsLite(): Promise<Manifest[]> {
    return this.get("/manifests?lite=1");
  }

  // ----- oauth (for integrations that need it) -----

  oauthStatus(provider: string): Promise<{ connected: boolean; account?: string }> {
    return this.get(`/oauth/${encodeURIComponent(provider)}/status`);
  }

  oauthResources(provider: string): Promise<Array<{ id: string; name: string }>> {
    return this.get(`/oauth/${encodeURIComponent(provider)}/resources`);
  }

  // ----- internals -----

  private get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "GET" });
  }

  private post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    });
  }

  private del<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "DELETE" });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    // A server whose prepared plan was outdated by an addon migration answers
    // once with SQLSTATE 0A000 / 26000 and has already dropped it: one retry
    // is enough and safe (the statement never ran).
    return withStaleRetry(() => this.requestOnce<T>(path, init));
  }

  private async requestOnce<T>(path: string, init: RequestInit): Promise<T> {
    const fetchImpl = this.opts.fetch ?? globalThis.fetch;
    const headers = new Headers(init.headers ?? {});
    const custom = this.opts.headers?.() ?? {};
    for (const [k, v] of Object.entries(custom)) headers.set(k, v);
    // Manifests, navigation and the installed list are a function of the
    // installed addons: always revalidate (ETag -> cheap 304), never reuse a
    // browser-cached copy, whatever Cache-Control the host sent.
    const res = await fetchImpl(`${this.opts.baseUrl}${path}`, {
      cache: init.method === "GET" ? "no-cache" : undefined,
      ...init,
      headers,
    });
    // Every answer carries the cache epoch: a token that moved means an addon
    // changed since this tab last looked (see ./cache-epoch).
    observeCacheEpoch(epochFromHeaders(res.headers));
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new MarketplaceError(res.status, text || res.statusText);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}

export class MarketplaceError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "MarketplaceError";
  }
}

export interface CatalogEntry {
  manifest: Manifest;
  installable: boolean;
  entitled: boolean;
  installed: boolean;
  enabled?: boolean;
}

export interface InstallPayload {
  agent_id?: string;
  credentials?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  selected_tools?: string[];
}
