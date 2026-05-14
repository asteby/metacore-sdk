/**
 * Vite build config for the `tickets` addon frontend.
 *
 * Produces a Module Federation `remoteEntry.js` consumed at runtime by the
 * metacore SDK (`loadFederatedAddon` in @asteby/metacore-sdk). The output is
 * subsequently packed into the addon bundle by `metacore build` and served
 * by the host under `/api/metacore/addons/tickets/frontend/*`.
 *
 * Naming contract:
 *   The federation plugin `name` MUST match the value the SDK derives from
 *   the manifest — for this addon that's `metacore_tickets` (also mirrored
 *   in manifest.json → frontend.container so the runtime contract is
 *   explicit, not magical).
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import federation from "@originjs/vite-plugin-federation";

// VITE_ADDON_BASE_URL lets the CI build point to a CDN path; in the common
// case (served from the host backend) the base is the bundle-relative root.
const base = process.env.VITE_ADDON_BASE_URL ?? "./";

// The plugin still honours `singleton` at runtime, but its exported
// `SharedConfig` no longer types the field (drift introduced in
// @originjs/vite-plugin-federation 1.4.x). We declare a local share type that
// preserves the field so the literal type-checks while runtime behaviour is
// unchanged. Same approach the canonical `metacoreFederationShared()` helper
// in `@asteby/metacore-starter-config` uses.
interface FederationShareConfig {
  singleton?: boolean;
  requiredVersion?: string | false;
}

const shared: Record<string, FederationShareConfig> = {
  react: { singleton: true, requiredVersion: false },
  "react-dom": { singleton: true, requiredVersion: false },
  "@asteby/metacore-sdk": { singleton: true, requiredVersion: false },
};

export default defineConfig({
  base,
  plugins: [
    react(),
    federation({
      // Must match SDK's containerName(manifest): metacore_<key>.
      name: "metacore_tickets",
      filename: "remoteEntry.js",
      exposes: {
        "./plugin": "./src/plugin.tsx",
      },
      // Shared deps come from the host's shared scope. `requiredVersion: false`
      // keeps the addon forgiving about minor host bumps; the host wins.
      shared,
    }),
  ],
  build: {
    target: "esnext",
    // Federation requires esm output + no preload helpers that would race the
    // host's share scope.
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        format: "esm",
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
