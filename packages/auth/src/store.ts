import { create } from 'zustand'

const ACCESS_TOKEN = 'auth_token'
const USER_STORAGE = 'auth_user'

/**
 * Minimal identity contract every host shares. This is the ONLY shape the
 * SDK's own packages (pwa, websocket, notifications, runtime-react) may rely
 * on. Hosts with richer users type theirs via `getTypedAuthStore<TUser>()`.
 */
export interface BaseAuthUser {
  id: string
  email: string
  name: string
  role: string
  avatar?: string
}

/**
 * Default user shape kept for back-compat. The commerce/POS fields below are
 * host-domain leakage (belong to the app layer, not the SDK — see
 * metacore-kernel ARCHITECTURE.md Law 0). Deprecated: hosts should type
 * their own user via `getTypedAuthStore<MyUser>()`; these extras will move
 * out of the SDK in the next major.
 */
export interface AuthUser extends BaseAuthUser {
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

/**
 * Auth state parameterized by the host's user type. Same shape as
 * `AuthState`, with `user`/`setUser` narrowed to `TUser`.
 */
export interface AuthStateOf<TUser extends BaseAuthUser> {
  auth: {
    user: TUser | null
    setUser: (user: TUser | null) => void
    accessToken: string
    setAccessToken: (accessToken: string) => void
    resetAccessToken: () => void
    reset: () => void
  }
}

/**
 * Typed view over the ONE auth store singleton.
 *
 * Every `@asteby/*` package reads the same `useAuthStore` instance; hosts
 * whose user carries domain fields (numeric ids serialized to string,
 * patient/doctor refs, onboarding flags, …) get full typing without forking
 * the store or leaking their domain into the SDK:
 *
 *   interface DoctoresUser extends BaseAuthUser { doctor_id?: number }
 *   export const useAppAuthStore = getTypedAuthStore<DoctoresUser>()
 *
 * Runtime identity: `getTypedAuthStore() === useAuthStore` — it is only a
 * type-level cast, so subscriptions, persistence and cross-package
 * visibility are unaffected.
 */
export function getTypedAuthStore<TUser extends BaseAuthUser>() {
  return useAuthStore as unknown as typeof useAuthStore extends infer _S
    ? import('zustand').UseBoundStore<import('zustand').StoreApi<AuthStateOf<TUser>>>
    : never
}
