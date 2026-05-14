import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAuthStore, type AuthUser } from './store'

/**
 * Lightweight legacy user shape returned by {@link useAuth}.
 *
 * This is a strict subset of {@link AuthUser} kept for backwards-compatibility
 * with consumers written against the original Context-based AuthProvider. New
 * code should consume {@link AuthUser} via `useAuthStore` directly.
 */
export interface LegacyAuthUser {
  name: string
  email: string
  role: string
  avatar: string
}

export interface AuthProviderProps {
  children: ReactNode
  /**
   * localStorage key used to persist the lightweight user object.
   *
   * @deprecated The canonical store now manages persistence under
   * `AUTH_STORAGE_KEYS.USER_STORAGE` / `AUTH_STORAGE_KEYS.ACCESS_TOKEN`. This
   * prop is kept as a no-op for source compatibility.
   */
  storageKey?: string
  /**
   * Path to navigate to on `logout()`. Default: `/sign-in`.
   */
  signInPath?: string
  /**
   * Default avatar URL injected into the lightweight user produced by the
   * legacy `login(email, role)` helper.
   */
  defaultAvatar?: string
  /**
   * Optional initial user to seed the store with on mount. Useful for SSR /
   * hydration scenarios where the host knows the user before the store has
   * had a chance to read from `localStorage`. Once seeded, all subsequent
   * state lives in the zustand store.
   */
  initialUser?: AuthUser | null
  /**
   * Optional initial access token to seed the store with on mount. Same
   * SSR/hydration use-case as {@link initialUser}.
   */
  initialAccessToken?: string
}

/**
 * Thin wrapper that forwards an optional initial user/token into
 * {@link useAuthStore} on mount. **All state lives in the zustand store** —
 * the provider holds no local state and renders no Context.
 *
 * @deprecated Use `useAuthStore` directly. `AuthProvider` is retained for
 * back-compat and for SSR / initial-state injection. The matching legacy
 * `useAuth` hook reads from the same store, so mounting the provider is
 * purely optional for new code.
 */
export function AuthProvider({
  children,
  initialUser,
  initialAccessToken,
  // storageKey is intentionally accepted but unused: kept in the signature
  // so existing consumers don't break, and so editors still surface it as a
  // prop with a deprecation hint via JSDoc.
  storageKey: _storageKey,
}: AuthProviderProps) {
  const seededRef = useRef(false)

  useEffect(() => {
    if (seededRef.current) return
    seededRef.current = true

    const { auth } = useAuthStore.getState()
    if (initialUser !== undefined && auth.user == null) {
      auth.setUser(initialUser)
    }
    if (initialAccessToken && !auth.accessToken) {
      auth.setAccessToken(initialAccessToken)
    }
  }, [initialUser, initialAccessToken])

  return <>{children}</>
}

/**
 * Legacy auth hook. Reads from the canonical {@link useAuthStore} and exposes
 * the original `{ user, login, logout, isAuthenticated }` shape so that
 * consumers written against the pre-store API keep working.
 *
 * Behavioural notes for back-compat:
 * - `user` is projected down to the {@link LegacyAuthUser} subset.
 * - `login(email, role)` builds a minimal user and writes it to the store via
 *   `auth.setUser(...)`. Apps that need the full {@link AuthUser} should
 *   call `useAuthStore.getState().auth.setUser(fullUser)` themselves.
 * - `logout()` calls `auth.reset()` (which clears both user and token) and
 *   navigates to {@link AuthProviderProps.signInPath} (defaults to `/sign-in`).
 *
 * @deprecated Prefer `useAuthStore(state => state.auth.user)` (or the full
 * `auth` slice) for new code. This hook will continue to work — it's a
 * read-through to the same store — but the canonical type is {@link AuthUser}.
 */
export function useAuth(options: { signInPath?: string; defaultAvatar?: string } = {}) {
  const { signInPath = '/sign-in', defaultAvatar = '' } = options
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.auth.user)

  const legacyUser: LegacyAuthUser | null = user
    ? {
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar ?? defaultAvatar,
      }
    : null

  const login = (email: string, role: string) => {
    const emailLocal = email.split('@')[0] ?? email
    const next: AuthUser = {
      id: '',
      name: emailLocal,
      email,
      role,
      avatar: defaultAvatar,
    }
    useAuthStore.getState().auth.setUser(next)
  }

  const logout = () => {
    useAuthStore.getState().auth.reset()
    navigate({ to: signInPath as never })
  }

  return {
    user: legacyUser,
    login,
    logout,
    isAuthenticated: !!user,
  }
}
