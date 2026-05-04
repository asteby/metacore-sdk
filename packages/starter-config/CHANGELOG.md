# @asteby/metacore-starter-config

## 2.1.0

### Minor Changes

- 668c2c7: feat(starter-config): nuevo preset `metacoreFederationShared({ host, apps })` para Module Federation con singletons obligatorios.

  Devuelve la config (`name`, `filename`, `remotes`, `exposes`, `shared`) lista para
  pasar a `@originjs/vite-plugin-federation`, con los 7 paquetes que TODA app
  federada (host + addons) del ecosistema metacore debe declarar `singleton: true`
  ya cableados:
  - `react`, `react-dom`
  - `@asteby/metacore-runtime-react`, `@asteby/metacore-theme`, `@asteby/metacore-auth`, `@asteby/metacore-ui`
  - `@asteby/metacore-sdk`

  Sin esto, los addons bundlean su propia copia de React + Providers y se rompen
  `useApi()`, `useTheme()`, `useAuth()`, los Radix portals y el `Registry` cross-tree
  (reasoning detallado en `docs/audits/2026-05-04-mf-shared-deps.md`).

  API mínima — host:

  ```ts
  import federation from "@originjs/vite-plugin-federation";
  import { metacoreFederationShared } from "@asteby/metacore-starter-config/vite";

  federation(
    metacoreFederationShared({
      host: "metacore_ops",
      apps: {
        metacore_tickets: "https://addons.example.com/tickets/remoteEntry.js",
      },
    }),
  );
  ```

  API mínima — addon:

  ```ts
  federation(
    metacoreFederationShared({
      host: "metacore_tickets",
      exposes: { "./plugin": "./src/plugin.tsx" },
    }),
  );
  ```

  Soporta `extras` (paquetes adicionales a marcar singleton) y `overrides`
  (forzar `requiredVersion`/`strictVersion` por package). También se exporta
  `METACORE_FEDERATION_SINGLETONS` para tests/validaciones.

  Ejemplo end-to-end en `examples/fullstack-starter/frontend/vite.config.ts`.
  No breaking — sólo agrega símbolos a `@asteby/metacore-starter-config/vite`.

## 2.0.0

### Major Changes

- 0e8db78: Promote three critical SDK packages to **1.0.0**. This is a stability promotion — the public surface of each package has been exercised by every metacore app in production (`link`, `ops`, `hub/landing`, `hub/frontend`, `fullstack-starter`) and is now committed under semver.

  No breaking API changes ship in this bump.
  - `@asteby/metacore-theme` (0.3 → 1.0): tokens, CSS-variable contract (`--primary`, `--background`, `--sidebar-*`, …), `themeConfig` shape, `ThemeProvider` / `useTheme`, and the `./preset` / `./fonts` / `./tokens.css` / `./index.css` subpaths are all stable. Internal `oklch` values may still re-tune in minor releases.
  - `@asteby/metacore-starter-config` (0.3 → 1.0): the four shared subpaths (`./tailwind`, `./tsconfig`, `./vite`, `./eslint`) plus `./fonts` are stable. `defineMetacoreConfig()` options stay additive within the major.
  - `@asteby/metacore-app-providers` (0.6.5 → 1.0): all providers (`DirectionProvider`, `FontProvider`, `LayoutProvider`, `SearchProvider`, `PlatformConfigProvider`), the `MetacoreAppShell` full kit, `applyBranding` / `applyCachedBranding` helpers, and persistence keys (`dir`, `font`, `layout_variant`, `layout_collapsible`, `platform-branding`) are locked. Optional peers (`@asteby/metacore-pwa`, `@asteby/metacore-runtime-react`, `@asteby/metacore-ui`, `sonner`) keep their independent cadence via the declared peer ranges.

### Minor Changes

- 64de425: Add `@asteby/metacore-starter-config/fonts` subpath that exports the canonical `fonts` array (`['inter', 'manrope', 'system']`) plus a `Font` type alias.

  Apps consuming the new `FontProvider` API in `@asteby/metacore-app-providers` (which now requires an explicit `fonts` prop) can import the convention from this single source instead of redeclaring the list in every app:

  ```ts
  import { fonts } from '@asteby/metacore-starter-config/fonts'
  import { FontProvider } from '@asteby/metacore-app-providers'

  <FontProvider fonts={fonts}>{children}</FontProvider>
  ```

## 0.3.0

### Minor Changes

- 046ad96: feat(starter-config): export `metacoreOptimizeDeps` preset

  Apps que consumen `@asteby/metacore-*` (linkeados via `file:`/workspace) topaban
  con `Failed to resolve module specifier` en el browser porque Vite por defecto
  no pre-bundlea linked deps y los `dist/*.js` se servían con imports bare.

  Se expone un nuevo preset `metacoreOptimizeDeps` (lista de includes para
  esbuild) y se mergea automáticamente dentro de `defineMetacoreConfig`, así las
  apps consumidoras quedan blindadas con una sola línea:

  ```ts
  import { metacoreOptimizeDeps } from "@asteby/metacore-starter-config/vite";

  export default defineConfig({
    optimizeDeps: metacoreOptimizeDeps,
    // ...
  });
  ```

## 0.2.0

### Minor Changes

- e23eede: Publicación inicial a npm del ecosistema metacore.

  Propaga los 13 paquetes del SDK al registry público para que las host applications consumidoras migren de `file:` a semver y Renovate pueda propagar updates.
