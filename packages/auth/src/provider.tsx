import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'

interface User {
  name: string
  email: string
  role: string
  avatar: string
}

interface AuthContextType {
  user: User | null
  login: (email: string, role: string) => void
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export interface AuthProviderProps {
  children: ReactNode
  /**
   * localStorage key used to persist the lightweight user object.
   * Default: `saas_user`
   */
  storageKey?: string
  /**
   * Path to navigate to on `logout()`. Default: `/sign-in`.
   */
  signInPath?: string
  /**
   * Default avatar URL injected into the lightweight user returned by
   * `login(email, role)`. Apps can override per-use by calling
   * `useAuthStore().setUser()` directly with the full user payload.
   */
  defaultAvatar?: string
}

export function AuthProvider({
  children,
  storageKey = 'saas_user',
  signInPath = '/sign-in',
  defaultAvatar = '',
}: AuthProviderProps) {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)

  // Load user from localStorage on mount (simple persistence)
  useEffect(() => {
    const storedUser = localStorage.getItem(storageKey)
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser) as User)
      } catch (e) {
        console.error('Failed to parse user from storage', e)
      }
    }
  }, [storageKey])

  const login = (email: string, role: string) => {
    const emailLocal = email.split('@')[0] ?? email
    const newUser: User = {
      name: emailLocal,
      email,
      role,
      avatar: defaultAvatar,
    }
    setUser(newUser)
    localStorage.setItem(storageKey, JSON.stringify(newUser))
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem(storageKey)
    localStorage.removeItem('auth-storage')
    // Note: host app is expected to have `signInPath` in its route tree; cast to any
    // so we don't require callers to register a literal type here.
    navigate({ to: signInPath as never })
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
