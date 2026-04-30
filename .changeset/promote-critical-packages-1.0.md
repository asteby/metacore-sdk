---
'@asteby/metacore-theme': major
'@asteby/metacore-starter-config': major
'@asteby/metacore-app-providers': major
---

Promote three critical SDK packages to **1.0.0**. This is a stability promotion — the public surface of each package has been exercised by every metacore app in production (`link`, `ops`, `hub/landing`, `hub/frontend`, `fullstack-starter`) and is now committed under semver.

No breaking API changes ship in this bump.

- `@asteby/metacore-theme` (0.3 → 1.0): tokens, CSS-variable contract (`--primary`, `--background`, `--sidebar-*`, …), `themeConfig` shape, `ThemeProvider` / `useTheme`, and the `./preset` / `./fonts` / `./tokens.css` / `./index.css` subpaths are all stable. Internal `oklch` values may still re-tune in minor releases.
- `@asteby/metacore-starter-config` (0.3 → 1.0): the four shared subpaths (`./tailwind`, `./tsconfig`, `./vite`, `./eslint`) plus `./fonts` are stable. `defineMetacoreConfig()` options stay additive within the major.
- `@asteby/metacore-app-providers` (0.6.5 → 1.0): all providers (`DirectionProvider`, `FontProvider`, `LayoutProvider`, `SearchProvider`, `PlatformConfigProvider`), the `MetacoreAppShell` full kit, `applyBranding` / `applyCachedBranding` helpers, and persistence keys (`dir`, `font`, `layout_variant`, `layout_collapsible`, `platform-branding`) are locked. Optional peers (`@asteby/metacore-pwa`, `@asteby/metacore-runtime-react`, `@asteby/metacore-ui`, `sonner`) keep their independent cadence via the declared peer ranges.
