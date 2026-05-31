---
"@asteby/metacore-starter-config": minor
---

Add `metacoreFederationAliases` — federated addons inherit the `virtual:pwa-register/react` no-op stub from the SDK instead of copying it.

`@asteby/metacore-app-providers` transitively imports `virtual:pwa-register/react` (vite-plugin-pwa's auto-generated module). A federated addon bundle has no vite-plugin-pwa, so that bare `virtual:` specifier resolves to nothing at runtime and silently breaks the addon's federated `register()` (host falls back to its generic declarative modal). The host owns the service worker, so the specifier must be aliased to a no-op stub.

`metacoreFederationAliases` (exported from `@asteby/metacore-starter-config/vite`) is a `resolve.alias` object addons spread into their Vite config. It aliases `virtual:pwa-register/react` to a stub (`pwa-register-stub.js`) shipped inside the package and resolved via `import.meta.url`, so it works for the published package without any consumer-relative path. The stub matches vite-plugin-pwa's `useRegisterSW` / `registerSW` surface.
