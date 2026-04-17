import { createApiClient } from '@asteby/metacore-auth/api-client'
import { useAuthStore } from '@asteby/metacore-auth/store'

/**
 * Shared axios instance wired with the auth kit's conventions:
 *  - Authorization: Bearer <token> (pulled from the Zustand auth store)
 *  - Accept-Language
 *  - 401 → reset auth + redirect to /sign-in
 *
 * Host apps usually wrap this once, pass it to `<ApiProvider>` from
 * runtime-react and to the PWA provider (optional) for push support.
 */
export const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8080',
  getToken: () => useAuthStore.getState().auth.accessToken,
  onUnauthorized: () => {
    useAuthStore.getState().auth.reset()
    if (typeof window !== 'undefined') {
      window.location.href = '/sign-in'
    }
  },
})
