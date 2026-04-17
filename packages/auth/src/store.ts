import { create } from 'zustand'

const ACCESS_TOKEN = 'auth_token'
const USER_STORAGE = 'auth_user'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: string
  avatar?: string
  organization_id?: string
  organization_name?: string
  organization_logo?: string
  // Subscription info
  plan_slug?: string
  plan_name?: string
  subscription_status?: 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid'
  current_period_end?: string
  is_subscription_active?: boolean
  currency_code?: string
  timezone?: string
  checkout_mode?: 'integrated' | 'cashier'
  fulfillment_mode?: 'auto' | 'warehouse'
  tax_rate?: number
  tax_included?: boolean
  ticket_width?: number
  print_copies?: number
  auto_print?: boolean
}

export interface AuthState {
  auth: {
    user: AuthUser | null
    setUser: (user: AuthUser | null) => void
    accessToken: string
    setAccessToken: (accessToken: string) => void
    resetAccessToken: () => void
    reset: () => void
  }
}

export const useAuthStore = create<AuthState>()((set) => {
  const token =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem(ACCESS_TOKEN) || ''
      : ''
  const storedUser =
    typeof localStorage !== 'undefined' ? localStorage.getItem(USER_STORAGE) : null
  const initialUser = storedUser ? (JSON.parse(storedUser) as AuthUser) : null

  return {
    auth: {
      user: initialUser,
      setUser: (user) =>
        set((state) => {
          if (user) {
            localStorage.setItem(USER_STORAGE, JSON.stringify(user))
          } else {
            localStorage.removeItem(USER_STORAGE)
          }
          return { ...state, auth: { ...state.auth, user } }
        }),
      accessToken: token,
      setAccessToken: (accessToken) =>
        set((state) => {
          localStorage.setItem(ACCESS_TOKEN, accessToken)
          return { ...state, auth: { ...state.auth, accessToken } }
        }),
      resetAccessToken: () =>
        set((state) => {
          localStorage.removeItem(ACCESS_TOKEN)
          localStorage.removeItem(USER_STORAGE)
          return { ...state, auth: { ...state.auth, accessToken: '', user: null } }
        }),
      reset: () =>
        set((state) => {
          localStorage.removeItem(ACCESS_TOKEN)
          localStorage.removeItem(USER_STORAGE)
          return {
            ...state,
            auth: { ...state.auth, user: null, accessToken: '' },
          }
        }),
    },
  }
})

export const AUTH_STORAGE_KEYS = {
  ACCESS_TOKEN,
  USER_STORAGE,
} as const
