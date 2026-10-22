/**
 * MarketplaceClient — transport-agnostic SDK for the host's marketplace API.
 * Mirrors the REST surface every kernel-consuming app exposes under
 * `/api/metacore/*`. Swap the `fetcher` to run against any host or a mock.
 */
import { epochFromHeaders, observeCacheEpoch, withStaleRetry } from "./cache-epoch.js";
export class MarketplaceClient {
    opts;
    constructor(opts) {
        this.opts = opts;
    }
    // ----- catalog -----
    catalog() {
        return this.get("/catalog");
    }
    detail(key) {
        return this.get(`/catalog/${encodeURIComponent(key)}`);
    }
    // ----- installations -----
    installed() {
        return this.get("/installations");
    }
    install(key, payload = {}) {
        return this.post(`/installations/${encodeURIComponent(key)}`, payload);
    }
    enable(key) {
        return this.post(`/installations/${encodeURIComponent(key)}/enable`);
    }
    disable(key) {
        return this.post(`/installations/${encodeURIComponent(key)}/disable`);
    }
    uninstall(key, dropData = false) {
        return this.del(`/installations/${encodeURIComponent(key)}?drop=${dropData}`);
    }
    updateSettings(key, settings) {
        return this.post(`/installations/${encodeURIComponent(key)}/settings`, settings);
    }
    // ----- navigation & manifests (used by the shell) -----
    navigation() {
        return this.get("/navigation");
    }
    manifests() {
        return this.get("/manifests");
    }
    /** Shell-oriented manifests (no columns/actions/i18n). Hosts SHOULD use this. */
    manifestsLite() {
        return this.get("/manifests?lite=1");
    }
    // ----- oauth (for integrations that need it) -----
    oauthStatus(provider) {
        return this.get(`/oauth/${encodeURIComponent(provider)}/status`);
    }
    oauthResources(provider) {
        return this.get(`/oauth/${encodeURIComponent(provider)}/resources`);
    }
    // ----- internals -----
    get(path) {
        return this.request(path, { method: "GET" });
    }
    post(path, body) {
        return this.request(path, {
            method: "POST",
            body: body === undefined ? undefined : JSON.stringify(body),
            headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        });
    }
    del(path) {
        return this.request(path, { method: "DELETE" });
    }
    async request(path, init) {
        // A server whose prepared plan was outdated by an addon migration answers
        // once with SQLSTATE 0A000 / 26000 and has already dropped it: one retry
        // is enough and safe (the statement never ran).
        return withStaleRetry(() => this.requestOnce(path, init));
    }
    async requestOnce(path, init) {
        const fetchImpl = this.opts.fetch ?? globalThis.fetch;
        const headers = new Headers(init.headers ?? {});
        const custom = this.opts.headers?.() ?? {};
        for (const [k, v] of Object.entries(custom))
            headers.set(k, v);
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
        if (res.status === 204)
            return undefined;
        return (await res.json());
    }
}
export class MarketplaceError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
        this.name = "MarketplaceError";
    }
}
