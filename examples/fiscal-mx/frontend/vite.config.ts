// Vite federation config — output remoteEntry.js that the host loads at
// runtime. `name` must match manifest.frontend.container (metacore_fiscal_mx).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import federation from "@originjs/vite-plugin-federation";

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
      name: "metacore_fiscal_mx",
      filename: "remoteEntry.js",
      exposes: { "./plugin": "./src/plugin.tsx" },
      shared,
    }),
  ],
  build: {
    target: "esnext",
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
