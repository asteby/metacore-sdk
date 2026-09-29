/**
 * MarketplaceClient — transport-agnostic SDK for the host's marketplace API.
 * Mirrors the REST surface every kernel-consuming app exposes under
 * `/api/metacore/*`. Swap the `fetcher` to run against any host or a mock.
 */
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
        const fetchImpl = this.opts.fetch ?? globalThis.fetch;
        const headers = new Headers(init.headers ?? {});
        const custom = this.opts.headers?.() ?? {};
        for (const [k, v] of Object.entries(custom))
            headers.set(k, v);
        const res = await fetchImpl(`${this.opts.baseUrl}${path}`, { ...init, headers });
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
