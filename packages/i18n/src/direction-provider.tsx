import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { DEFAULT_RTL_LANGUAGES, directionFor, type Direction } from './hooks'

export type { Direction } from './hooks'

export type DirectionContextValue = {
  defaultDir: Direction
  dir: Direction
  setDir: (dir: Direction) => void
  resetDir: () => void
}

const DirectionContext = createContext<DirectionContextValue | null>(null)

export type DirectionProviderProps = {
  children: ReactNode
  /**
   * Initial direction to seed the provider with. Defaults to `'ltr'`.
   * Overridden by `storage` if a stored value exists.
   */
  defaultDir?: Direction
  /**
   * Optional pluggable storage (e.g. `localStorage`-backed wrapper or a
   * cookie helper). Leave undefined to disable persistence.
   */
  storage?: {
    get: () => Direction | null | undefined
    set: (dir: Direction) => void
    remove: () => void
  }
  /**
   * If provided, direction auto-syncs to this language code using the
   * `rtlLanguages` list. Useful when wired to i18next's current language.
   */
  language?: string
  /**
   * Override the list of languages considered RTL. Defaults to
   * `DEFAULT_RTL_LANGUAGES` from `./hooks`.
   */
  rtlLanguages?: readonly string[]
  /**
   * When `true` (default in browser), syncs `<html dir>` with the active
   * direction on every change.
   */
  syncHtmlDir?: boolean
}

export function DirectionProvider({
  children,
  defaultDir = 'ltr',
  storage,
  language,
  rtlLanguages = DEFAULT_RTL_LANGUAGES,
  syncHtmlDir = typeof document !== 'undefined',
}: DirectionProviderProps) {
  const [dir, _setDir] = useState<Direction>(() => {
    const stored = storage?.get()
    if (stored === 'ltr' || stored === 'rtl') return stored
    if (language) return directionFor(language, rtlLanguages)
    return defaultDir
  })

  // Keep in sync with the active language when caller wires one in.
  useEffect(() => {
    if (!language) return
    // Respect an explicit stored preference over language-derived direction.
    if (storage?.get()) return
    const next = directionFor(language, rtlLanguages)
    _setDir((prev) => (prev === next ? prev : next))
  }, [language, rtlLanguages, storage])

  useEffect(() => {
    if (!syncHtmlDir || typeof document === 'undefined') return
    document.documentElement.setAttribute('dir', dir)
  }, [dir, syncHtmlDir])

  const setDir = useCallback(
    (next: Direction) => {
      _setDir(next)
      storage?.set(next)
    },
    [storage],
  )

  const resetDir = useCallback(() => {
    _setDir(defaultDir)
    storage?.remove()
  }, [defaultDir, storage])

  const value = useMemo<DirectionContextValue>(
    () => ({ defaultDir, dir, setDir, resetDir }),
    [defaultDir, dir, setDir, resetDir],
  )

  return (
    <DirectionContext.Provider value={value}>
      {children}
    </DirectionContext.Provider>
  )
}

export function useDirection(): DirectionContextValue {
  const context = useContext(DirectionContext)
  if (!context) {
    throw new Error('useDirection must be used within a DirectionProvider')
  }
  return context
}
