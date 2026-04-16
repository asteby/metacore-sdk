/**
 * MarketplaceClient — transport-agnostic SDK for the host's marketplace API.
 * Mirrors the REST surface every kernel-consuming app exposes under
 * `/api/metacore/*`. Swap the `fetcher` to run against ops, link, or a mock.
 */

import type { Installation, Manifest, NavGroup } from "./types.js";

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
    const fetchImpl = this.opts.fetch ?? globalThis.fetch;
    const headers = new Headers(init.headers ?? {});
    const custom = this.opts.headers?.() ?? {};
    for (const [k, v] of Object.entries(custom)) headers.set(k, v);
    const res = await fetchImpl(`${this.opts.baseUrl}${path}`, { ...init, headers });
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
