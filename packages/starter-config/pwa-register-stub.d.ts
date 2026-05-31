/**
 * No-op stub matching the public surface of `virtual:pwa-register/react`
 * (vite-plugin-pwa). Federated addons alias `virtual:pwa-register/react` to
 * this module via `metacoreFederationAliases` so the bare `virtual:` specifier
 * resolves in a bundle that has no vite-plugin-pwa. See `pwa-register-stub.js`
 * for the full rationale.
 */
export interface RegisterSWReturn {
  needRefresh: [boolean, (value: boolean) => void]
  offlineReady: [boolean, (value: boolean) => void]
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>
}

export function useRegisterSW(options?: unknown): RegisterSWReturn

export function registerSW(options?: unknown): () => Promise<void>
