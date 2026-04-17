/**
 * High-level startup helper: fetch manifests from the host, lazy-load every
 * federated addon, and register each one against the shared Registry.
 *
 *   const registry = new Registry();
 *   const client = new MarketplaceClient({ baseUrl: "/api/metacore" });
 *   await bootstrapAddons({ client, registry, kernelVersion: "2.0.0" });
 *   // Now mount <MetacoreProvider client registry> and the shell will render addons.
 */
import type { MarketplaceClient } from "./client.js";
import type { Registry } from "./registry.js";
export interface BootstrapOptions {
    client: MarketplaceClient;
    registry: Registry;
    kernelVersion: string;
    /** Optional telemetry hook. */
    telemetry?: (event: string, data?: Record<string, unknown>) => void;
    /** Optional filter (e.g. feature-flag specific addons). */
    filter?: (key: string) => boolean;
}
export declare function bootstrapAddons(opts: BootstrapOptions): Promise<void>;
//# sourceMappingURL=bootstrap.d.ts.map