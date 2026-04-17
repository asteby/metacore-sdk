// Stub — phase A3 will port the real auth-store.
// Provides the same shape so api.ts/format.ts compile during phase A1/A2.
import { create } from 'zustand'

interface AuthUser {
  currency_code?: string
}

interface AuthState {
  auth: {
    user: AuthUser | null
    reset: () => void
  }
}

export const useAuthStore = create<AuthState>(() => ({
  auth: {
    user: null,
    reset: () => {},
  },
}))
