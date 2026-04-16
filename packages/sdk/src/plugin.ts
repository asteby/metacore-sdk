/**
 * Plugin contract — every addon's federated module default-exports one of these.
 * The host calls `register(api)` once after loading the remote entry.
 */

import type { MarketplaceClient } from "./client.js";
import type { Registry } from "./registry.js";
import type { Manifest } from "./types.js";

/** What the host hands each addon at registration time. */
export interface AddonAPI {
  /** The installation's manifest (including merged settings). */
  manifest: Manifest;
  /** Current settings for this installation. */
  settings: Record<string, unknown>;
  /** Scoped registry — mutators contribute UI; readers are host-only. */
  registry: Pick<
    Registry,
    "registerRoute" | "registerModal" | "registerAction" | "registerSlot"
  >;
  /** The same client the host uses — addons call their own webhooks via host proxy. */
  client: MarketplaceClient;
  /** Version of the host kernel the addon is running on. */
  kernelVersion: string;
  /** Emits a diagnostic/telemetry event. */
  telemetry: (event: string, data?: Record<string, unknown>) => void;
  /** Logger scoped to the addon key. */
  log: {
    debug: (msg: string, data?: unknown) => void;
    info: (msg: string, data?: unknown) => void;
    warn: (msg: string, data?: unknown) => void;
    error: (msg: string, data?: unknown) => void;
  };
}

/** Every addon module's default export. */
export interface Plugin {
  /** Must equal the manifest.key — the host double-checks to catch mis-wirings. */
  key: string;
  /** Called once, synchronously, after the remote module loads. */
  register(api: AddonAPI): void | Promise<void>;
  /** Optional cleanup — called before the addon is disabled/unloaded. */
  dispose?(): void | Promise<void>;
}

/**
 * Convenience helper so addon authors get type inference on the object literal:
 *
 *   export default definePlugin({
 *     key: "tickets",
 *     register(api) { api.registry.registerRoute(...) },
 *   });
 */
export function definePlugin(p: Plugin): Plugin {
  return p;
}
