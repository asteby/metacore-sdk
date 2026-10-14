// Test-only stand-in for the `virtual:pwa-register/react` module that
// vite-plugin-pwa generates at build time. Tests replace it with vi.mock.
export function useRegisterSW(): never {
  throw new Error('virtual:pwa-register/react is not available in tests')
}
