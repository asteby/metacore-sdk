import { createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'

type SearchContextType = {
  open: boolean
  setOpen: Dispatch<SetStateAction<boolean>>
}

const SearchContext = createContext<SearchContextType | null>(null)

export interface SearchProviderProps {
  children: ReactNode
  /** Tecla para abrir (default 'k'). Modifier siempre es Cmd/Ctrl. */
  hotkey?: string
}

export function SearchProvider({ children, hotkey = 'k' }: SearchProviderProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === hotkey && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [hotkey])

  return (
    <SearchContext.Provider value={{ open, setOpen }}>
      {children}
    </SearchContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSearch() {
  const ctx = useContext(SearchContext)
  if (!ctx) throw new Error('useSearch must be used within a SearchProvider')
  return ctx
}
