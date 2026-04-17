import { createApiClient } from '@asteby/metacore-auth/api-client'
import { useAuthStore } from '@asteby/metacore-auth/store'

export const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:7200/api',
  getToken: () => useAuthStore.getState().auth.accessToken,
  onUnauthorized: () => {
    useAuthStore.getState().auth.reset()
    if (typeof window !== 'undefined') {
      window.location.href = '/sign-in'
    }
  },
})
