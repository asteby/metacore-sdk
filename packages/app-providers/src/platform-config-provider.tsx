// Centralized branding/theming for any metacore app. Apps fetch their tenant
// branding (name, logo, primary color) from a backend endpoint they own; this
// provider caches it, applies CSS variables to <html>, persists in
// localStorage so subsequent loads paint the right brand pre-React, and
// re-applies on dark/light toggles.
//
// Decoupled from the app: callers pass a `fetcher` (any async function returning
// a partial branding payload). No axios/api imports here — apps wire whatever
// transport they already use (axios, fetch, ofetch, etc.).
import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

export interface PlatformBranding {
  platform_name: string
  platform_logo: string
  primary_color: string
  accent_color: string
  favicon_url: string
  support_email: string
  support_url: string
}

export const FALLBACK_BRANDING: PlatformBranding = {
  platform_name: '',
  platform_logo: '',
  primary_color: '#6366f1',
  accent_color: '#8b5cf6',
  favicon_url: '',
  support_email: '',
  support_url: '',
}

interface PlatformConfigContextType extends PlatformBranding {
  refetch: () => void
}

const PlatformConfigContext = createContext<PlatformConfigContextType>({
  ...FALLBACK_BRANDING,
  refetch: () => {},
})

// sRGB hex (#rrggbb) → CSS oklch() string. Returns null on bad input.
function hexToOklch(hex: string): string | null {
  if (!hex || !hex.startsWith('#')) return null
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const toLinear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  const lr = toLinear(r),
    lg = toLinear(g),
    lb = toLinear(b)

  const l_ = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
  const m_ = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
  const s_ = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb

  const l = Math.cbrt(l_),
    m = Math.cbrt(m_),
    s = Math.cbrt(s_)

  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
  const bOk = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s

  const C = Math.sqrt(a * a + bOk * bOk)
  let h = Math.atan2(bOk, a) * (180 / Math.PI)
  if (h < 0) h += 360

  return `oklch(${L.toFixed(4)} ${C.toFixed(4)} ${h.toFixed(4)})`
}

function generateThemeVars(primaryHex: string, accentHex: string) {
  const primary = hexToOklch(primaryHex)
  const accent = hexToOklch(accentHex)
  if (!primary || !accent) return null

  const parseOklch = (s: string) => {
    const m = s.match(/oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/)
    if (!m || !m[1] || !m[2] || !m[3]) return null
    return { l: parseFloat(m[1]), c: parseFloat(m[2]), h: parseFloat(m[3]) }
  }

  const p = parseOklch(primary)
  if (!p) return null

  const isDark = document.documentElement.classList.contains('dark')
  const vars: Record<string, string> = {}

  if (isDark) {
    vars['--primary'] = `oklch(${(p.l + 0.05).toFixed(4)} ${p.c.toFixed(4)} ${p.h.toFixed(4)})`
    vars['--ring'] = vars['--primary']
    vars['--sidebar-primary'] = vars['--primary']
    vars['--sidebar-accent-foreground'] = vars['--primary']
    vars['--sidebar-ring'] = vars['--primary']
    vars['--chart-2'] = vars['--primary']
    vars['--secondary'] = `oklch(0.29 0.02 ${p.h.toFixed(4)})`
    vars['--muted'] = `oklch(0.29 0.02 ${p.h.toFixed(4)})`
    vars['--accent'] = `oklch(0.28 0.05 ${p.h.toFixed(4)})`
    vars['--accent-foreground'] = `oklch(0.80 0.10 ${p.h.toFixed(4)})`
    vars['--border'] = `oklch(0.33 0.02 ${p.h.toFixed(4)})`
    vars['--input'] = `oklch(0.33 0.02 ${p.h.toFixed(4)})`
    vars['--background'] = `oklch(0.22 0.01 ${p.h.toFixed(4)})`
    vars['--card'] = `oklch(0.24 0.01 ${p.h.toFixed(4)})`
    vars['--popover'] = `oklch(0.24 0.01 ${p.h.toFixed(4)})`
    vars['--sidebar'] = `oklch(0.20 0.01 ${p.h.toFixed(4)})`
    vars['--sidebar-accent'] = `oklch(0.29 0.02 ${p.h.toFixed(4)})`
    vars['--sidebar-border'] = `oklch(0.33 0.02 ${p.h.toFixed(4)})`
  } else {
    vars['--primary'] = primary
    vars['--ring'] = `oklch(0 0 0)`
    vars['--sidebar-primary'] = `oklch(0 0 0)`
    vars['--chart-2'] = primary
    vars['--secondary'] = `oklch(0.9540 0.0063 ${p.h.toFixed(4)})`
    vars['--accent'] = `oklch(0.94 0.03 ${p.h.toFixed(4)})`
    vars['--accent-foreground'] = `oklch(0.5445 0.1903 ${p.h.toFixed(4)})`
    vars['--border'] = `oklch(0.9300 0.0094 ${p.h.toFixed(4)})`
    vars['--sidebar'] = `oklch(0.9777 0.0051 ${p.h.toFixed(4)})`
  }

  return vars
}

function applyThemeVars(vars: Record<string, string>) {
  const root = document.documentElement
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
}

export function applyBranding(
  data: Partial<PlatformBranding>,
  defaults: PlatformBranding = FALLBACK_BRANDING,
) {
  if (data.primary_color || data.accent_color) {
    const vars = generateThemeVars(
      data.primary_color || defaults.primary_color,
      data.accent_color || defaults.accent_color,
    )
    if (vars) applyThemeVars(vars)
  }

  if (data.platform_name) {
    document.title = data.platform_name
  }

  const root = document.documentElement
  if (data.primary_color) {
    root.style.setProperty('--brand-primary', data.primary_color)
  }
  if (data.accent_color) {
    root.style.setProperty('--brand-accent', data.accent_color)
  }
}

const STORAGE_KEY = 'platform-branding'

// Paint cached branding before React mounts so the initial frame matches the
// tenant theme. Safe to call on module import — guarded by try/catch and
// browser-only checks.
export function applyCachedBranding(storageKey: string = STORAGE_KEY) {
  if (typeof window === 'undefined') return
  try {
    const cached = window.localStorage.getItem(storageKey)
    if (cached) applyBranding(JSON.parse(cached) as PlatformBranding)
  } catch {
    // ignore — corrupted JSON or quota errors aren't fatal
  }
}

export type BrandingFetcher = () => Promise<Partial<PlatformBranding>>

export interface PlatformConfigProviderProps {
  children: ReactNode
  /**
   * Fetches the current tenant's branding. Apps wire their own transport
   * (axios, fetch, ofetch). Resolve to a partial — the provider merges over
   * `defaults`. Reject to fall back to defaults.
   */
  fetcher: BrandingFetcher
  /**
   * Defaults applied when the fetcher hasn't resolved yet OR when it returns
   * empty fields. Apps pass their static brand (name, primary color) as the
   * baseline so the UI never paints with FALLBACK_BRANDING's empty name.
   */
  defaults?: PlatformBranding
  /** TanStack Query staleTime, defaults to 5 minutes. */
  staleTime?: number
  /** localStorage key for the persisted branding cache. */
  storageKey?: string
}

export function PlatformConfigProvider({
  children,
  fetcher,
  defaults = FALLBACK_BRANDING,
  staleTime = 5 * 60 * 1000,
  storageKey = STORAGE_KEY,
}: PlatformConfigProviderProps) {
  const queryClient = useQueryClient()

  const { data: branding } = useQuery({
    queryKey: ['platform-branding', storageKey],
    queryFn: async () => {
      const res = await fetcher()
      return { ...defaults, ...res } as PlatformBranding
    },
    staleTime,
    retry: 1,
  })

  const current = branding || defaults

  useEffect(() => {
    if (branding) {
      applyBranding(branding, defaults)
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(branding))
      } catch {
        // ignore quota errors
      }
    }
  }, [branding, defaults, storageKey])

  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (current.primary_color) applyBranding(current, defaults)
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => observer.disconnect()
  }, [current, defaults])

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['platform-branding', storageKey] })
  }

  return (
    <PlatformConfigContext value={{ ...current, refetch }}>
      {children}
    </PlatformConfigContext>
  )
}

export function usePlatformConfig() {
  return useContext(PlatformConfigContext)
}
