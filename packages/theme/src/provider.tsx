import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  THEME_MODE_COOKIE,
  releaseThemeBoot,
  watchThemeBoot,
  type ThemeBootWatchOptions,
} from './boot.js'

type Theme = 'dark' | 'light' | 'system'
type ResolvedTheme = Exclude<Theme, 'system'>

const DEFAULT_THEME: Theme = 'system'
const DEFAULT_STORAGE_KEY = THEME_MODE_COOKIE
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
  /**
   * Stores the resolved theme of <html> for `themeBootScript()`, so the next
   * load paints it before the first frame. On by default; pass options to
   * change what is kept. A custom `storageKey` must also be given to the
   * script as `modeCookie`.
   */
  persistBoot?: boolean | ThemeBootWatchOptions
}

export type ThemeProviderState = {
  defaultTheme: Theme
  resolvedTheme: ResolvedTheme
  theme: Theme
  setTheme: (theme: Theme) => void
  resetTheme: () => void
}

const initialState: ThemeProviderState = {
  defaultTheme: DEFAULT_THEME,
  resolvedTheme: 'light',
  theme: DEFAULT_THEME,
  setTheme: () => null,
  resetTheme: () => null,
}

const ThemeContext = createContext<ThemeProviderState>(initialState)

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${encodeURIComponent(name)}=`))
  if (!match) return undefined
  const value = match.split('=')[1]
  return value ? decodeURIComponent(value) : undefined
}

function writeCookie(name: string, value: string, maxAge: number) {
  if (typeof document === 'undefined') return
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`
}

function clearCookie(name: string) {
  if (typeof document === 'undefined') return
  document.cookie = `${encodeURIComponent(name)}=; path=/; max-age=0; SameSite=Lax`
}

export function ThemeProvider({
  children,
  defaultTheme = DEFAULT_THEME,
  storageKey = DEFAULT_STORAGE_KEY,
  persistBoot = true,
}: ThemeProviderProps) {
  const [theme, _setTheme] = useState<Theme>(
    () => (readCookie(storageKey) as Theme | undefined) || defaultTheme
  )

  const resolvedTheme = useMemo((): ResolvedTheme => {
    if (theme === 'system') {
      if (typeof window === 'undefined') return 'light'
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
    }
    return theme as ResolvedTheme
  }, [theme])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const root = window.document.documentElement
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    // Unchanged classes are left alone: every class mutation makes the
    // branding provider repaint its tokens.
    const applyTheme = (current: ResolvedTheme) => {
      const other = current === 'dark' ? 'light' : 'dark'
      if (root.classList.contains(current) && !root.classList.contains(other)) return
      root.classList.remove(other)
      root.classList.add(current)
    }

    const handleChange = () => {
      if (theme === 'system') {
        applyTheme(mediaQuery.matches ? 'dark' : 'light')
      }
    }

    applyTheme(resolvedTheme)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme, resolvedTheme])

  const bootOptions = typeof persistBoot === 'object' ? persistBoot : undefined
  useEffect(() => {
    const stop = persistBoot === false ? () => {} : watchThemeBoot(bootOptions)
    releaseThemeBoot()
    return stop
    // Options are read once: the watcher lives as long as the app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistBoot === false])

  const setTheme = (next: Theme) => {
    writeCookie(storageKey, next, THEME_COOKIE_MAX_AGE)
    _setTheme(next)
  }

  const resetTheme = () => {
    clearCookie(storageKey)
    _setTheme(defaultTheme)
  }

  const value: ThemeProviderState = {
    defaultTheme,
    resolvedTheme,
    theme,
    setTheme,
    resetTheme,
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeProviderState {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
