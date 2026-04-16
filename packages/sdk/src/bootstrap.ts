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
import { loadFederatedAddon } from "./federation.js";
import type { Plugin } from "./plugin.js";
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

export async function bootstrapAddons(opts: BootstrapOptions): Promise<void> {
  const manifests = await opts.client.manifests();
  const telemetry = opts.telemetry ?? (() => {});
  await Promise.all(
    manifests.map(async (m) => {
      if (!m.frontend) return;
      if (opts.filter && !opts.filter(m.key)) return;
      try {
        const mod = (await loadFederatedAddon(m.frontend, m.key)) as Plugin;
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
      } catch (err) {
        telemetry("metacore.addon.load_failed", { key: m.key, error: String(err) });
        console.error(`[metacore] addon ${m.key} failed to load:`, err);
      }
    }),
  );
}

function scopedLogger(key: string) {
  const tag = `[addon:${key}]`;
  return {
    debug: (msg: string, data?: unknown) => console.debug(tag, msg, data ?? ""),
    info: (msg: string, data?: unknown) => console.info(tag, msg, data ?? ""),
    warn: (msg: string, data?: unknown) => console.warn(tag, msg, data ?? ""),
    error: (msg: string, data?: unknown) => console.error(tag, msg, data ?? ""),
  };
}
