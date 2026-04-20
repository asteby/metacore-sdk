import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { DirectionProvider as RdxDirProvider } from '@radix-ui/react-direction'
import { getCookie, setCookie, removeCookie } from './cookies'

export type Direction = 'ltr' | 'rtl'

const DEFAULT_DIRECTION: Direction = 'ltr'
const DIRECTION_COOKIE_NAME = 'dir'
const DIRECTION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

type DirectionContextType = {
  defaultDir: Direction
  dir: Direction
  setDir: (dir: Direction) => void
  resetDir: () => void
}

const DirectionContext = createContext<DirectionContextType | null>(null)

export function DirectionProvider({ children }: { children: ReactNode }) {
  const [dir, _setDir] = useState<Direction>(
    () => (getCookie(DIRECTION_COOKIE_NAME) as Direction) || DEFAULT_DIRECTION
  )

  useEffect(() => {
    document.documentElement.setAttribute('dir', dir)
  }, [dir])

  const setDir = (next: Direction) => {
    _setDir(next)
    setCookie(DIRECTION_COOKIE_NAME, next, DIRECTION_COOKIE_MAX_AGE)
  }

  const resetDir = () => {
    _setDir(DEFAULT_DIRECTION)
    removeCookie(DIRECTION_COOKIE_NAME)
  }

  return (
    <DirectionContext.Provider
      value={{ defaultDir: DEFAULT_DIRECTION, dir, setDir, resetDir }}
    >
      <RdxDirProvider dir={dir}>{children}</RdxDirProvider>
    </DirectionContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDirection() {
  const ctx = useContext(DirectionContext)
  if (!ctx) throw new Error('useDirection must be used within a DirectionProvider')
  return ctx
}
