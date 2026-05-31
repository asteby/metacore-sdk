---
"@asteby/metacore-runtime-react": minor
"@asteby/metacore-starter-config": minor
---

Migrate federation tooling from the broken `@originjs/vite-plugin-federation` to the official `@module-federation/vite` + `@module-federation/runtime`.

**BREAKING (federation runtime swap — hosts and addons must rebuild):**

- `metacoreFederationShared()` (starter-config) now returns a `@module-federation/vite` `federation()` config instead of an `@originjs` config. Same signature/call-sites: `metacoreFederationShared({ host })` → host config (name + shared, empty remotes — remotes register dynamically at runtime); `metacoreFederationShared({ host, exposes })` → remote config (name + filename + exposes + shared). Hosts MUST switch their `vite.config.ts` to `import { federation } from '@module-federation/vite'`.
- The shared singleton list is now `{ singleton: true }` (no `requiredVersion: false`) and matches the addon + ops host contract exactly: `react`, `react-dom`, `react/jsx-runtime`, `react-i18next`, `i18next`, `@asteby/metacore-ui`, `@asteby/metacore-runtime-react`, `@asteby/metacore-sdk`, `@asteby/metacore-app-providers`, `@asteby/metacore-theme`, `@asteby/metacore-auth`. **Build-time gotcha:** `@module-federation/vite` resolves every shared bare specifier at build time, so each must be an installed (dev)dependency of the building package.
- `AddonLoader` (runtime-react) now uses `@module-federation/runtime` (`registerRemotes` + `loadRemote`) instead of the manual `init`/`get`/`window[scope]` machinery. The host's `@module-federation/vite` build auto-initialises the shared scope, so the remote consumes the HOST's React/SDK singletons — fixing the `useState`-null crash.
- `clearFederationContainer()` is now a deprecated no-op under the MF runtime (container replacement on hot-swap is handled by `registerRemotes(..., { force: true })`).
