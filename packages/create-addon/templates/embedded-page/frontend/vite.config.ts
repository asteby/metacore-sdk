/**
 * Build config for the {{ADDON_KEY}} addon frontend (embedded page).
 *
 * One remote, two kinds of expose:
 *   ./register     headless: actions, slots (no routes — pages come from the manifest)
 *   ./pages/board  the page declared in manifest.json#frontend.pages[]
 *
 * `metacoreFederationShared({ manifest })` fails the build if a page in the
 * manifest has no expose, shares React/router/query/i18n/UI kit with the host
 * as singletons, and declares the page's lazy shares (maps/charts) with
 * `import: false` so this remote never bundles its own copy.
 * `metacorePageBudgetPlugin` measures each page (gzip, shares excluded) against
 * `budget_kb` and writes dist/metacore-pages.json for `metacore build`.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { federation } from '@module-federation/vite'
import {
  METACORE_FEDERATION_SINGLETONS,
  metacoreFederationAliases,
  metacoreFederationBudgetPlugin,
  metacoreFederationShared,
  metacoreOptimizeDeps,
  metacorePageBudgetPlugin,
} from '@asteby/metacore-starter-config/vite'

const manifest = '../manifest.json'
const exposes = {
  './register': './src/register.tsx',
  './pages/board': './src/pages/board.tsx',
}

export default defineConfig({
  base: process.env.VITE_ADDON_BASE_URL ?? './',
  resolve: { alias: { ...metacoreFederationAliases } },
  plugins: [
    react(),
    tailwindcss(),
    federation({
      ...metacoreFederationShared({ host: 'metacore_{{ADDON_KEY}}', exposes, manifest }),
      dts: false,
    }),
    // Per-page budget (manifest budget_kb, ≤ 150 KB gzip) + metacore-pages.json.
    metacorePageBudgetPlugin({ manifest, exposes, singletons: METACORE_FEDERATION_SINGLETONS }),
    // Whole-remote ceilings shared with the hub (512 KiB remoteEntry / 4 MiB).
    metacoreFederationBudgetPlugin(),
  ],
  optimizeDeps: metacoreOptimizeDeps,
  build: {
    target: 'esnext',
    modulePreload: false,
    cssCodeSplit: false,
  },
  server: { port: 5273 },
})
