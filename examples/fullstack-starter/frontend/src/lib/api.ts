import { createApiClient } from '@asteby/metacore-auth/api-client'
import { useAuthStore } from '@asteby/metacore-auth/store'
import i18n from './i18n'

export const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:7200/api',
  getToken: () => useAuthStore.getState().auth.accessToken,
  // Backend reads Accept-Language to localise table titles, column labels and
  // option chips (see kernel/i18n + metadata transformers). Sending the active
  // i18n language keeps client and server-side strings in sync.
  getLanguage: () => i18n.language,
  onUnauthorized: () => {
    useAuthStore.getState().auth.reset()
    if (!window.location.pathname.startsWith('/sign-in')) {
      window.location.href = '/sign-in'
    }
  },
})
