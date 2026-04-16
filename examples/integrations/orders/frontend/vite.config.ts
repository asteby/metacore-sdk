import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import federation from "@originjs/vite-plugin-federation";

const base = process.env.VITE_ADDON_BASE_URL ?? "./";

export default defineConfig({
  base,
  plugins: [
    react(),
    federation({
      name: "metacore_orders",
      filename: "remoteEntry.js",
      exposes: { "./plugin": "./src/plugin.tsx" },
      shared: {
        react: { singleton: true, requiredVersion: false },
        "react-dom": { singleton: true, requiredVersion: false },
        "@asteby/metacore-sdk": { singleton: true, requiredVersion: false },
      },
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
