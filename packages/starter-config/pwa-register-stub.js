// No-op stub for `virtual:pwa-register/react`.
//
// `@asteby/metacore-app-providers` (e.g. via `useOrgConfig`) transitively
// imports `virtual:pwa-register/react` — the module vite-plugin-pwa
// auto-generates. That virtual module ONLY exists when an app runs
// vite-plugin-pwa. A FEDERATED addon bundle does not run it, so the bare
// `virtual:` specifier resolves to nothing at runtime (`ERR_FAILED` / CORS on
// the `virtual:` specifier), which tears down the whole addon module and
// silently drops the federated `register()` — the host then falls back to its
// generic declarative modal.
//
// The addon is NEVER the PWA owner (the HOST shell registers the service
// worker), so service-worker registration is a no-op here. Addons alias the
// virtual specifier to this stub (see `metacoreFederationAliases` in
// `vite-preset`) so the import always resolves. The shape matches
// vite-plugin-pwa's `virtual:pwa-register/react` public API (`useRegisterSW`
// + `registerSW`) so any caller keeps type/runtime-checking out.
export function useRegisterSW(_options) {
  const noop = () => {}
  return {
    needRefresh: [false, noop],
    offlineReady: [false, noop],
    updateServiceWorker: async (_reloadPage) => {},
  }
}

export function registerSW(_options) {
  return async () => {}
}
