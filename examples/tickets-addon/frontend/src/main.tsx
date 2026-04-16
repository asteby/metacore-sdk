/**
 * Standalone dev harness for the tickets addon.
 *
 * This entry is NOT used in production — in prod the addon is loaded as a
 * federated remote by the host shell (ops / link). Instead, `main.tsx` lets a
 * developer run `vite dev` and exercise the plugin in isolation against a
 * fake Registry + MarketplaceClient pair.
 *
 * Flow:
 *   1. Build a real `Registry` from @asteby/metacore-sdk.
 *   2. Build a `MarketplaceClient` with a stub fetcher (no network).
 *   3. Synthesize a minimal `AddonAPI` from the manifest.
 *   4. Call `plugin.register(api)` — this populates the registry.
 *   5. Render the first registered route into `#root`.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import {
  MarketplaceClient,
  Registry,
  type AddonAPI,
  type Manifest,
} from "@asteby/metacore-sdk";

import plugin from "./plugin";

// Mirror the on-disk manifest.json shape closely enough for the plugin to run.
const manifest: Manifest = {
  key: "tickets",
  name: "Tickets & Pedidos",
  version: "1.0.0",
  kernel: ">=2.0.0 <3.0.0",
} as unknown as Manifest;

const registry = new Registry();

// Stub client — rejects every call so dev mode doesn't silently hit a real API.
const client = new MarketplaceClient({
  baseUrl: "http://localhost:0/_dev_stub",
  fetch: async () => {
    throw new Error("dev harness: network disabled");
  },
});

const api: AddonAPI = {
  manifest,
  settings: {},
  registry,
  client,
  kernelVersion: "2.0.0-dev",
  telemetry: (event, data) => console.debug("[telemetry]", event, data),
  log: {
    debug: (...a) => console.debug("[tickets]", ...a),
    info: (...a) => console.info("[tickets]", ...a),
    warn: (...a) => console.warn("[tickets]", ...a),
    error: (...a) => console.error("[tickets]", ...a),
  },
};

void Promise.resolve(plugin.register(api)).then(() => {
  const routes = registry.getRoutes();
  const root = document.getElementById("root");
  if (!root) {
    console.error("dev harness: #root element missing");
    return;
  }
  const first = routes[0];
  const Node = first ? <first.component /> : <div>no routes registered</div>;
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <div style={{ fontFamily: "system-ui, sans-serif" }}>
        <header style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
          <strong>tickets</strong> dev harness · {routes.length} route(s)
          registered
        </header>
        <main>{Node}</main>
      </div>
    </React.StrictMode>,
  );
});
