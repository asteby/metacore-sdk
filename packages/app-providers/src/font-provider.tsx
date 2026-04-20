import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getCookie, setCookie, removeCookie } from './cookies'

const FONT_COOKIE_NAME = 'font'
const FONT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

type FontContextType = {
  font: string
  setFont: (font: string) => void
  resetFont: () => void
}

const FontContext = createContext<FontContextType | null>(null)

export interface FontProviderProps {
  children: ReactNode
  /** Lista de fonts permitidas. La primera es el default. */
  fonts: readonly string[]
}

export function FontProvider({ children, fonts }: FontProviderProps) {
  const defaultFont = fonts[0] ?? ''
  const [font, _setFont] = useState<string>(() => {
    const saved = getCookie(FONT_COOKIE_NAME)
    return saved && fonts.includes(saved) ? saved : defaultFont
  })

  useEffect(() => {
    const root = document.documentElement
    root.classList.forEach((cls) => {
      if (cls.startsWith('font-')) root.classList.remove(cls)
    })
    if (font) root.classList.add(`font-${font}`)
  }, [font])

  const setFont = (next: string) => {
    setCookie(FONT_COOKIE_NAME, next, FONT_COOKIE_MAX_AGE)
    _setFont(next)
  }

  const resetFont = () => {
    removeCookie(FONT_COOKIE_NAME)
    _setFont(defaultFont)
  }

  return (
    <FontContext.Provider value={{ font, setFont, resetFont }}>
      {children}
    </FontContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFont(): FontContextType {
  const ctx = useContext(FontContext)
  if (!ctx) throw new Error('useFont must be used within a FontProvider')
  return ctx
}
