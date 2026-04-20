import { createContext, useContext, useState, type ReactNode } from 'react'
import { getCookie, setCookie } from './cookies'

export type Collapsible = 'offcanvas' | 'icon' | 'none'
export type Variant = 'inset' | 'sidebar' | 'floating'

const LAYOUT_COLLAPSIBLE_COOKIE_NAME = 'layout_collapsible'
const LAYOUT_VARIANT_COOKIE_NAME = 'layout_variant'
const LAYOUT_COOKIE_MAX_AGE = 60 * 60 * 24 * 7

const DEFAULT_VARIANT: Variant = 'inset'
const DEFAULT_COLLAPSIBLE: Collapsible = 'icon'

type LayoutContextType = {
  resetLayout: () => void
  defaultCollapsible: Collapsible
  collapsible: Collapsible
  setCollapsible: (c: Collapsible) => void
  defaultVariant: Variant
  variant: Variant
  setVariant: (v: Variant) => void
}

const LayoutContext = createContext<LayoutContextType | null>(null)

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [collapsible, _setCollapsible] = useState<Collapsible>(() => {
    const saved = getCookie(LAYOUT_COLLAPSIBLE_COOKIE_NAME)
    return (saved as Collapsible) || DEFAULT_COLLAPSIBLE
  })

  const [variant, _setVariant] = useState<Variant>(() => {
    const saved = getCookie(LAYOUT_VARIANT_COOKIE_NAME)
    return (saved as Variant) || DEFAULT_VARIANT
  })

  const setCollapsible = (next: Collapsible) => {
    _setCollapsible(next)
    setCookie(LAYOUT_COLLAPSIBLE_COOKIE_NAME, next, LAYOUT_COOKIE_MAX_AGE)
  }

  const setVariant = (next: Variant) => {
    _setVariant(next)
    setCookie(LAYOUT_VARIANT_COOKIE_NAME, next, LAYOUT_COOKIE_MAX_AGE)
  }

  const resetLayout = () => {
    setCollapsible(DEFAULT_COLLAPSIBLE)
    setVariant(DEFAULT_VARIANT)
  }

  return (
    <LayoutContext.Provider
      value={{
        resetLayout,
        defaultCollapsible: DEFAULT_COLLAPSIBLE,
        collapsible,
        setCollapsible,
        defaultVariant: DEFAULT_VARIANT,
        variant,
        setVariant,
      }}
    >
      {children}
    </LayoutContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLayout() {
  const ctx = useContext(LayoutContext)
  if (!ctx) throw new Error('useLayout must be used within a LayoutProvider')
  return ctx
}
