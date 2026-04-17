import { createContext, useContext, useState, ReactNode, useEffect } from 'react'
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

export function AuthProvider({ children }: { children: ReactNode }) {
    const navigate = useNavigate()
    const [user, setUser] = useState<User | null>(null)

    // Load user from localStorage on mount (simple persistence)
    useEffect(() => {
        const storedUser = localStorage.getItem('saas_user')
        if (storedUser) {
            try {
                setUser(JSON.parse(storedUser))
            } catch (e) {
                console.error('Failed to parse user from storage', e)
            }
        }
    }, [])

    const login = (email: string, role: string) => {
        const newUser = {
            name: email.split('@')[0],
            email,
            role,
            avatar: 'https://github.com/shadcn.png',
        }
        setUser(newUser)
        localStorage.setItem('saas_user', JSON.stringify(newUser))
        // Navigation is handled by the calling component usually, but we can ensure root
        // navigate({ to: '/' })
    }

    const logout = () => {
        setUser(null)
        localStorage.removeItem('saas_user')
        localStorage.removeItem('auth-storage') // Clear zustand store too if needed
        navigate({ to: '/sign-in' })
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
