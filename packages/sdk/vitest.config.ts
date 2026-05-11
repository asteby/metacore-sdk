import { defineConfig } from "vitest/config";

export default defineConfig({
  // Source files share their basename with stale .js artifacts that pre-date
  // the dist/ migration; prefer .ts so tests run against the live sources.
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".mjs", ".json"],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
