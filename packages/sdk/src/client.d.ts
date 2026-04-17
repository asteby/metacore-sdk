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
export declare class MarketplaceClient {
    private readonly opts;
    constructor(opts: ClientOptions);
    catalog(): Promise<CatalogEntry[]>;
    detail(key: string): Promise<CatalogEntry>;
    installed(): Promise<Installation[]>;
    install(key: string, payload?: InstallPayload): Promise<Installation>;
    enable(key: string): Promise<Installation>;
    disable(key: string): Promise<Installation>;
    uninstall(key: string, dropData?: boolean): Promise<void>;
    updateSettings(key: string, settings: Record<string, unknown>): Promise<Installation>;
    navigation(): Promise<NavGroup[]>;
    manifests(): Promise<Manifest[]>;
    oauthStatus(provider: string): Promise<{
        connected: boolean;
        account?: string;
    }>;
    oauthResources(provider: string): Promise<Array<{
        id: string;
        name: string;
    }>>;
    private get;
    private post;
    private del;
    private request;
}
export declare class MarketplaceError extends Error {
    readonly status: number;
    constructor(status: number, message: string);
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
//# sourceMappingURL=client.d.ts.map