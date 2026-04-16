/**
 * High-level startup helper: fetch manifests from the host, lazy-load every
 * federated addon, and register each one against the shared Registry.
 *
 *   const registry = new Registry();
 *   const client = new MarketplaceClient({ baseUrl: "/api/metacore" });
 *   await bootstrapAddons({ client, registry, kernelVersion: "2.0.0" });
 *   // Now mount <MetacoreProvider client registry> and the shell will render addons.
 */
import { loadFederatedAddon } from "./federation.js";
export async function bootstrapAddons(opts) {
    const manifests = await opts.client.manifests();
    const telemetry = opts.telemetry ?? (() => { });
    await Promise.all(manifests.map(async (m) => {
        if (!m.frontend)
            return;
        if (opts.filter && !opts.filter(m.key))
            return;
        try {
            const mod = (await loadFederatedAddon(m.frontend, m.key));
            if (mod.key !== m.key) {
                throw new Error(`plugin.key ${mod.key} mismatches manifest.key ${m.key}`);
            }
            await mod.register({
                manifest: m,
                settings: {},
                registry: opts.registry,
                client: opts.client,
                kernelVersion: opts.kernelVersion,
                telemetry,
                log: scopedLogger(m.key),
            });
            telemetry("metacore.addon.loaded", { key: m.key, version: m.version });
        }
        catch (err) {
            telemetry("metacore.addon.load_failed", { key: m.key, error: String(err) });
            console.error(`[metacore] addon ${m.key} failed to load:`, err);
        }
    }));
}
function scopedLogger(key) {
    const tag = `[addon:${key}]`;
    return {
        debug: (msg, data) => console.debug(tag, msg, data ?? ""),
        info: (msg, data) => console.info(tag, msg, data ?? ""),
        warn: (msg, data) => console.warn(tag, msg, data ?? ""),
        error: (msg, data) => console.error(tag, msg, data ?? ""),
    };
}
