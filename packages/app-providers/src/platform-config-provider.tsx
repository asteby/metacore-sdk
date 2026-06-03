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

// oklch → linear-sRGB relative luminance (CIE Y, 0..1). Used to choose a
// readable text color over an arbitrary brand surface. Inverse of the
// matrices in hexToOklch.
function oklchLuminance(L: number, C: number, hDeg: number): number {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b

  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_

  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s

  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
}

// Pick near-black or near-white for text on a brand surface, whichever wins
// WCAG contrast. This is what makes a dark/grey brand usable in dark mode:
// a light-grey `--primary` gets dark text instead of the hardcoded white that
// previously rendered invisible. `c`/`h` matter because chromatic surfaces of
// the same L carry different luminance.
const FG_LIGHT = 'oklch(0.985 0 0)'
const FG_DARK = 'oklch(0.18 0 0)'
function readableForeground(l: number, c: number, h: number): string {
  const y = oklchLuminance(l, c, h)
  const contrastWhite = (1.0 + 0.05) / (y + 0.05)
  const contrastBlack = (y + 0.05) / 0.05
  return contrastBlack > contrastWhite ? FG_DARK : FG_LIGHT
}

// The full set of CSS custom properties the branding system owns. Both
// light and dark code paths MUST write a value for every key in this
// list, otherwise toggling between modes leaves stale values from the
// previous mode on `<html>.style` and the UI ends up with, e.g., a dark
// `--background` rendered under light-mode `--primary` — fluorescent
// chrome floating on a black canvas. Keep dark and light symmetrical.
const BRANDED_KEYS = [
  '--primary',
  '--primary-foreground',
  '--ring',
  '--chart-2',
  '--secondary',
  '--muted',
  '--accent',
  '--accent-foreground',
  '--border',
  '--input',
  '--background',
  '--card',
  '--popover',
  '--sidebar',
  '--sidebar-primary',
  '--sidebar-primary-foreground',
  '--sidebar-accent',
  '--sidebar-accent-foreground',
  '--sidebar-border',
  '--sidebar-ring',
] as const

// Clamp the perceptual lightness of the brand color into a band that produces
// readable buttons/badges. Without this, intrinsically light hues like lime
// (#84cc16 → L≈0.77) render fluorescent — and dark mode's +0.05 bias makes
// it worse. Indigo (#6366f1 → L≈0.55) stays untouched.
function clampL(l: number, min: number, max: number) {
  return Math.min(Math.max(l, min), max)
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

  // A grey/near-grey brand has no meaningful hue — hexToOklch returns float
  // noise for it (e.g. #2b2b2b → h≈90). Applying the surfaces' fixed chroma
  // at that bogus hue paints the whole UI a random tint (the warm/sepia cast
  // a dark-grey brand produced before this). When achromatic, collapse hue
  // and chroma to 0 so the theme stays cleanly neutral.
  const isAchromatic = p.c < 0.02
  const h = (isAchromatic ? 0 : p.h).toFixed(4)
  const pc = (isAchromatic ? 0 : p.c).toFixed(4)
  // surface-chroma: zeroed for grey brands, passthrough otherwise.
  const sc = (c: number) => (isAchromatic ? 0 : c).toFixed(4)
  const vars: Record<string, string> = {}

  if (isDark) {
    // Brighten the brand so it reads as an accent on the ~0.22 dark canvas.
    // The floor (0.55) is what "inverts" an intrinsically dark/near-black
    // brand into a visible mid-light surface instead of vanishing into the
    // background; the ceiling (0.70) keeps lime/yellow from blowing out.
    const lPrimary = clampL(p.l + 0.05, 0.55, 0.70)
    const fgPrimary = readableForeground(lPrimary, isAchromatic ? 0 : p.c, p.h)
    vars['--primary'] = `oklch(${lPrimary.toFixed(4)} ${pc} ${h})`
    vars['--primary-foreground'] = fgPrimary
    vars['--ring'] = vars['--primary']
    vars['--chart-2'] = vars['--primary']
    vars['--secondary'] = `oklch(0.29 ${sc(0.02)} ${h})`
    vars['--muted'] = `oklch(0.29 ${sc(0.02)} ${h})`
    vars['--accent'] = `oklch(0.28 ${sc(0.05)} ${h})`
    vars['--accent-foreground'] = `oklch(0.80 ${sc(0.10)} ${h})`
    vars['--border'] = `oklch(0.33 ${sc(0.02)} ${h})`
    vars['--input'] = `oklch(0.33 ${sc(0.02)} ${h})`
    vars['--background'] = `oklch(0.22 ${sc(0.01)} ${h})`
    vars['--card'] = `oklch(0.24 ${sc(0.01)} ${h})`
    vars['--popover'] = `oklch(0.24 ${sc(0.01)} ${h})`
    vars['--sidebar'] = `oklch(0.20 ${sc(0.01)} ${h})`
    vars['--sidebar-primary'] = vars['--primary']
    vars['--sidebar-primary-foreground'] = fgPrimary
    vars['--sidebar-accent'] = `oklch(0.29 ${sc(0.02)} ${h})`
    vars['--sidebar-accent-foreground'] = vars['--primary']
    vars['--sidebar-border'] = `oklch(0.33 ${sc(0.02)} ${h})`
    vars['--sidebar-ring'] = vars['--primary']
  } else {
    const lPrimary = clampL(p.l, 0.45, 0.65)
    const primaryClamped = `oklch(${lPrimary.toFixed(4)} ${pc} ${h})`
    const fgPrimary = readableForeground(lPrimary, isAchromatic ? 0 : p.c, p.h)
    vars['--primary'] = primaryClamped
    vars['--primary-foreground'] = fgPrimary
    vars['--ring'] = `oklch(0 0 0)`
    vars['--chart-2'] = primaryClamped
    vars['--secondary'] = `oklch(0.9540 ${sc(0.0063)} ${h})`
    vars['--muted'] = `oklch(0.9702 0 0)`
    vars['--accent'] = `oklch(0.94 ${sc(0.03)} ${h})`
    vars['--accent-foreground'] = `oklch(0.5445 ${sc(0.1903)} ${h})`
    vars['--border'] = `oklch(0.9300 ${sc(0.0094)} ${h})`
    vars['--input'] = `oklch(0.9401 0 0)`
    vars['--background'] = `oklch(0.9940 0 0)`
    vars['--card'] = `oklch(0.9940 0 0)`
    vars['--popover'] = `oklch(0.9911 0 0)`
    vars['--sidebar'] = `oklch(0.9777 ${sc(0.0051)} ${h})`
    vars['--sidebar-primary'] = `oklch(0 0 0)`
    vars['--sidebar-primary-foreground'] = `oklch(1 0 0)`
    vars['--sidebar-accent'] = `oklch(0.9401 0 0)`
    vars['--sidebar-accent-foreground'] = `oklch(0 0 0)`
    vars['--sidebar-border'] = `oklch(0.9401 0 0)`
    vars['--sidebar-ring'] = `oklch(0 0 0)`
  }

  return vars
}

function applyThemeVars(vars: Record<string, string>) {
  const root = document.documentElement
  // Clear any branded keys we won't be rewriting in this pass so a
  // stale value from a previous mode/branding can't bleed through.
  for (const key of BRANDED_KEYS) {
    if (!(key in vars)) root.style.removeProperty(key)
  }
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
}

// Treat empty/whitespace strings as "not provided" so a tenant row with a
// blank color column can't blank out the brand (or skip branding entirely,
// dropping the UI back to the unstyled fallback theme).
function clean(v: string | undefined): string | undefined {
  const t = typeof v === 'string' ? v.trim() : ''
  return t ? t : undefined
}

export function applyBranding(
  data: Partial<PlatformBranding>,
  defaults: PlatformBranding = FALLBACK_BRANDING,
) {
  const primaryHex = clean(data.primary_color) ?? clean(defaults.primary_color)
  const accentHex = clean(data.accent_color) ?? clean(defaults.accent_color)

  if (primaryHex || accentHex) {
    const vars = generateThemeVars(
      primaryHex ?? FALLBACK_BRANDING.primary_color,
      accentHex ?? FALLBACK_BRANDING.accent_color,
    )
    if (vars) applyThemeVars(vars)
  }

  const name = clean(data.platform_name)
  if (name) {
    document.title = name
  }

  const root = document.documentElement
  if (primaryHex) {
    root.style.setProperty('--brand-primary', primaryHex)
  }
  if (accentHex) {
    root.style.setProperty('--brand-accent', accentHex)
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
      // Merge only non-empty fields over defaults — an empty string from the
      // API (unset DB column) must not overwrite a good default and blank the
      // brand. Mirrors `clean()` used in applyBranding.
      const merged = { ...defaults } as unknown as Record<string, unknown>
      for (const [k, v] of Object.entries(res)) {
        if (typeof v === 'string' ? v.trim() !== '' : v != null) {
          merged[k] = v
        }
      }
      return merged as unknown as PlatformBranding
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
