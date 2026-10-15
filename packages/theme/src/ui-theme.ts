// UI theme packs — surfaces, type, density and radius as <html data-ui-*> attributes.
// The CSS lives in `@asteby/metacore-theme/ui-themes.css`. A pack never sets the
// accent: that is always the host's brand (see `setUiThemeBrandPainter`).

export type UIFontKey =
  | 'inter'
  | 'manrope'
  | 'system'
  | 'geist'
  | 'dm_sans'
  | 'space_grotesk'
  | 'outfit'
  | 'plus_jakarta'
  | 'source_serif'
  | 'ibm_plex'

export type UIDensityKey = 'comfortable' | 'compact'
export type UIRadiusKey = '' | 'sm' | 'md' | 'lg'

/** Pack keys — must match data-ui-theme + backend allowlist. */
export type UIThemeKey =
  | 'default'
  | 'classic'
  | 'glass'
  | 'soft'
  | 'sharp'
  | 'bold_tech'
  | 'amber_minimal'
  | 'ocean'
  | 'rose'
  | 'midnight'
  | 'candyland'
  | 'caffeine'
  | 'clean_slate'

export type OrgUiThemeState = {
  theme_key: UIThemeKey
  font: UIFontKey
  density: UIDensityKey
  radius?: UIRadiusKey
  color_source?: 'branding' | 'custom'
}

export type UIThemePack = {
  key: UIThemeKey
  name: string
  description: string
  defaultFont: UIFontKey
  defaultDensity: UIDensityKey
  /** Four swatches for the card preview (primary → surfaces). */
  swatches: [string, string, string, string]
  /**
   * Accent shown on the pack's own card in the picker. Never painted on the
   * app: the accent is always the org brand, a pack only brings surfaces.
   */
  suggestedPrimary?: string
}

const STORAGE_KEY = 'org-ui-theme'

export const UI_THEME_PACKS: UIThemePack[] = [
  {
    key: 'default',
    name: 'Neutro',
    description: 'Limpio y neutro.',
    suggestedPrimary: '#6366f1',
    defaultFont: 'inter',
    defaultDensity: 'comfortable',
    swatches: ['#6366f1', '#eef2ff', '#c7d2fe', '#312e81'],
  },
  {
    key: 'classic',
    name: 'Clásico',
    description: 'ERP familiar — radios medios, tipografía densa.',
    defaultFont: 'manrope',
    defaultDensity: 'comfortable',
    swatches: ['#eb2221', '#fef2f2', '#fecaca', '#7f1d1d'],
  },
  {
    key: 'glass',
    name: 'Glass',
    description: 'Premium translúcido con blur y bordes suaves.',
    defaultFont: 'manrope',
    defaultDensity: 'comfortable',
    swatches: ['#3b82f6', '#eff6ff', '#bfdbfe', '#1e3a8a'],
    suggestedPrimary: '#3b82f6',
  },
  {
    key: 'soft',
    name: 'Soft',
    description: 'Retail amable — radios amplios, ámbar suave.',
    defaultFont: 'dm_sans',
    defaultDensity: 'comfortable',
    swatches: ['#f59e0b', '#fffbeb', '#fde68a', '#78350f'],
    suggestedPrimary: '#f59e0b',
  },
  {
    key: 'sharp',
    name: 'Sharp',
    description: 'Compacto y técnico — bordes vivos.',
    defaultFont: 'geist',
    defaultDensity: 'compact',
    swatches: ['#0f172a', '#f8fafc', '#cbd5e1', '#020617'],
    suggestedPrimary: '#0f172a',
  },
  {
    key: 'bold_tech',
    name: 'Bold Tech',
    description: 'Violeta intenso — claro y oscuro con contraste.',
    defaultFont: 'space_grotesk',
    defaultDensity: 'comfortable',
    swatches: ['#7c3aed', '#ede9fe', '#a78bfa', '#4c1d95'],
    suggestedPrimary: '#7c3aed',
  },
  {
    key: 'amber_minimal',
    name: 'Amber Minimal',
    description: 'Ámbar limpio, superficies claras.',
    defaultFont: 'outfit',
    defaultDensity: 'comfortable',
    swatches: ['#d97706', '#fffbeb', '#fcd34d', '#78350f'],
    suggestedPrimary: '#d97706',
  },
  {
    key: 'ocean',
    name: 'Ocean',
    description: 'Azul profundo, sidebar oscuro, calma operativa.',
    defaultFont: 'plus_jakarta',
    defaultDensity: 'comfortable',
    swatches: ['#0284c7', '#ecfeff', '#67e8f9', '#164e63'],
    suggestedPrimary: '#0284c7',
  },
  {
    key: 'rose',
    name: 'Rose',
    description: 'Rosa contemporáneo, retail premium.',
    defaultFont: 'dm_sans',
    defaultDensity: 'comfortable',
    swatches: ['#e11d48', '#fff1f2', '#fda4af', '#881337'],
    suggestedPrimary: '#e11d48',
  },
  {
    key: 'midnight',
    name: 'Midnight',
    description: 'Negro azulado, acentos cian.',
    defaultFont: 'geist',
    defaultDensity: 'comfortable',
    swatches: ['#06b6d4', '#ecfeff', '#67e8f9', '#0b1220'],
    suggestedPrimary: '#06b6d4',
  },
  {
    key: 'candyland',
    name: 'Candyland',
    description: 'Neón alegre — rosa / verde / azul.',
    defaultFont: 'dm_sans',
    defaultDensity: 'comfortable',
    swatches: ['#ec4899', '#22c55e', '#3b82f6', '#fdf2f8'],
    suggestedPrimary: '#ec4899',
  },
  {
    key: 'caffeine',
    name: 'Caffeine',
    description: 'Café / crema editorial, serif.',
    defaultFont: 'source_serif',
    defaultDensity: 'comfortable',
    swatches: ['#92400e', '#fef3c7', '#d6d3d1', '#44403c'],
    suggestedPrimary: '#92400e',
  },
  {
    key: 'clean_slate',
    name: 'Clean Slate',
    description: 'Grises precisos, tipografía crisp.',
    defaultFont: 'ibm_plex',
    defaultDensity: 'comfortable',
    swatches: ['#18181b', '#fafafa', '#a1a1aa', '#3f3f46'],
    suggestedPrimary: '#18181b',
  },
]

export function getThemePack(key: string): UIThemePack | undefined {
  return UI_THEME_PACKS.find((p) => p.key === key)
}

/** Hosts register how brand colors are painted (e.g. app-providers' applyBranding). */
export type UiBrandPainter = (colors: { primary_color: string; accent_color: string }) => void
let brandPainter: UiBrandPainter | null = null
export function setUiThemeBrandPainter(fn: UiBrandPainter | null) {
  brandPainter = fn
}

function brandingCacheKey(): string {
  if (typeof window === 'undefined' || !window.location?.hostname) return 'platform-branding'
  return `platform-branding:${window.location.hostname}`
}

/** Persist brand hex so a hard refresh keeps the live pick. */
function cacheBrandColors(primary: string, accent?: string) {
  try {
    const key = brandingCacheKey()
    const prev = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, string>
    localStorage.setItem(key, JSON.stringify({ ...prev, primary_color: primary, accent_color: accent || primary }))
  } catch {
    /* ignore */
  }
}

/** Paint brand primary/accent immediately through the registered painter (no reload). */
export function applyBrandColorLive(primaryHex: string, accentHex?: string) {
  const primary = primaryHex?.trim()
  if (!primary) return
  const accent = (accentHex || primary).trim()
  brandPainter?.({ primary_color: primary, accent_color: accent })
  cacheBrandColors(primary, accent)
}

export function applyUiTheme(state: Partial<OrgUiThemeState>) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const theme = (state.theme_key || 'default') as UIThemeKey
  const font = (state.font || 'inter') as UIFontKey
  const density = (state.density || 'comfortable') as UIDensityKey
  const radius = (state.radius || '') as UIRadiusKey

  // Only what differs: the boot script already painted the cached theme, and
  // every attribute write restyles the page.
  const set = (name: string, value: string) => {
    if (root.getAttribute(name) !== value) root.setAttribute(name, value)
  }
  set('data-ui-theme', theme)
  set('data-ui-font', font)
  set('data-ui-density', density)
  if (radius) set('data-ui-radius', radius)
  else if (root.hasAttribute('data-ui-radius')) root.removeAttribute('data-ui-radius')

  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        theme_key: theme,
        font,
        density,
        radius,
        color_source: state.color_source || 'branding',
      }),
    )
  } catch {
    /* ignore */
  }
}

/** Apply pack + color in one shot (surfaces first, then brand tokens). */
export function paintLiveDesign(opts: {
  theme_key: UIThemeKey
  font: UIFontKey
  density: UIDensityKey
  primary: string
  accent?: string
  color_source?: 'branding' | 'custom'
}) {
  applyUiTheme({ theme_key: opts.theme_key, font: opts.font, density: opts.density, color_source: opts.color_source })
  if (opts.primary?.trim()) applyBrandColorLive(opts.primary, opts.accent)
}

export function applyCachedUiTheme() {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    applyUiTheme(JSON.parse(raw) as OrgUiThemeState)
  } catch {
    /* ignore */
  }
}
