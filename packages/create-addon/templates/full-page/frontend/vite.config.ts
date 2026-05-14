/**
 * Build config for the {{ADDON_KEY}} addon frontend.
 *
 * Produces `remoteEntry.js` consumed by the metacore host shell. The
 * federation container name MUST equal `metacore_{{ADDON_KEY}}` — that's the
 * value the SDK derives from `manifest.key` (see `containerName(manifest)`)
 * and it's mirrored in `manifest.json → frontend.container`.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import federation from '@originjs/vite-plugin-federation'
import {
  metacoreFederationShared,
  metacoreOptimizeDeps,
} from '@asteby/metacore-starter-config/vite'

// VITE_ADDON_BASE_URL lets CI builds point to a CDN path; in the common case
// (served from the kernel) the base is the bundle-relative root.
const base = process.env.VITE_ADDON_BASE_URL ?? './'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    federation(
      metacoreFederationShared({
        host: 'metacore_{{ADDON_KEY}}',
        exposes: {
          './plugin': './src/plugin.tsx',
        },
      })
    ),
  ],
  // Required when the addon consumes linked `@asteby/metacore-*` packages —
  // without this Vite serves bare specifiers to the browser and the dev
  // server explodes. Memory: feedback_optimize_deps_metacore.
  optimizeDeps: metacoreOptimizeDeps,
  build: {
    target: 'esnext',
    // Federation requires esm output + no preload helpers that would race the
    // host's share scope.
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        format: 'esm',
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: { port: 5273 },
})
