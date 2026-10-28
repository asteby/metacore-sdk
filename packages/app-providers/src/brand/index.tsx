// Product identity for any metacore app: fetches the host's `/api/brand`
// manifest (name, artwork, theme, assistant) and exposes the EFFECTIVE identity
// through `useBrand()` = product brand overlaid with the tenant's own
// customisation (`/api/platform/branding`, when an org sets it).
//
// Lives on its own subpath (`@asteby/metacore-app-providers/brand`) and is not
// re-exported from the package barrel, so apps that don't use it don't bundle it.
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  BRAND_PATH,
  parseBrand,
  pickLogo,
  type BrandManifest,
  type BrandMascotSkin,
} from '@asteby/metacore-sdk/brand'
import {
  FALLBACK_BRANDING,
  usePlatformConfig,
  type PlatformBranding,
} from '../platform-config-provider'
import { isValidSkin, type MascotSkin } from '../mascot'

export type { BrandManifest } from '@asteby/metacore-sdk/brand'

const CACHE_KEY = 'mc:product-brand:v1'

interface CachedBrand {
  etag?: string
  manifest: unknown
}

function readWindowBrand(origin: string): BrandManifest | null {
  if (typeof window === 'undefined') return null
  return parseBrand((window as unknown as { __PRODUCT_BRAND__?: unknown }).__PRODUCT_BRAND__, origin)
}

function readCache(origin: string): { manifest: BrandManifest; etag?: string } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as CachedBrand
    const manifest = parseBrand(c.manifest, origin)
    return manifest ? { manifest, etag: typeof c.etag === 'string' ? c.etag : undefined } : null
  } catch {
    return null
  }
}

function writeCache(manifest: BrandManifest, etag: string | undefined) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ etag, manifest } satisfies CachedBrand))
  } catch {
    // quota / private mode: the cache is only an optimisation
  }
}

export type BrandLoadResult =
  | { status: 'not-modified' }
  | { status: 'ok'; manifest: BrandManifest; etag?: string }

/**
 * One conditional GET of `{origin}/api/brand`. `If-None-Match` is sent when an
 * `etag` is known; a 304 means "keep what you have".
 */
export async function loadProductBrand(opts: {
  origin?: string
  etag?: string
  fetch?: typeof fetch
  signal?: AbortSignal
}): Promise<BrandLoadResult> {
  const origin = (opts.origin ?? '').replace(/\/+$/, '')
  const f = opts.fetch ?? globalThis.fetch
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (opts.etag) headers['If-None-Match'] = opts.etag
  const res = await f(`${origin}${BRAND_PATH}`, { headers, signal: opts.signal })
  if (res.status === 304) return { status: 'not-modified' }
  if (!res.ok) throw new Error(`brand: GET ${BRAND_PATH} -> ${res.status}`)
  const manifest = parseBrand(await res.json(), origin)
  if (!manifest) throw new Error('brand: invalid manifest')
  return { status: 'ok', manifest, etag: res.headers?.get?.('ETag') ?? undefined }
}

const ProductBrandContext = createContext<BrandManifest | null>(null)

export interface ProductBrandProviderProps {
  children: ReactNode
  /** Origin serving `/api/brand`; default same-origin. */
  origin?: string
  /** Manifest to paint the first frame with (wins over window/localStorage). */
  initial?: BrandManifest
  /** Custom transport (default: `fetch`). Must honour `etag` like `loadProductBrand`. */
  fetcher?: (opts: { origin: string; etag?: string; signal?: AbortSignal }) => Promise<BrandLoadResult>
}

/**
 * First frame from `initial` → `window.__PRODUCT_BRAND__` (inlined by the host's
 * boot script) → localStorage; then revalidates with the ETag and persists.
 */
export function ProductBrandProvider({
  children,
  origin = '',
  initial,
  fetcher,
}: ProductBrandProviderProps) {
  const [state, setState] = useState<{ manifest: BrandManifest | null; etag?: string }>(() => {
    if (initial) return { manifest: initial }
    const inlined = readWindowBrand(origin)
    if (inlined) return { manifest: inlined }
    const cached = readCache(origin)
    return cached ?? { manifest: null }
  })

  useEffect(() => {
    const ctrl = new AbortController()
    const run = fetcher ?? ((o) => loadProductBrand(o))
    run({ origin, etag: state.etag, signal: ctrl.signal })
      .then((r) => {
        if (r.status !== 'ok') return
        setState({ manifest: r.manifest, etag: r.etag })
        writeCache(r.manifest, r.etag)
      })
      .catch(() => {
        // offline / host without /api/brand: keep whatever we painted
      })
    return () => ctrl.abort()
    // Revalidate once per origin; the etag only matters at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, fetcher])

  return <ProductBrandContext value={state.manifest}>{children}</ProductBrandContext>
}

/** The raw product manifest, or null until known / when the host has none. */
export function useProductBrand(): BrandManifest | null {
  return useContext(ProductBrandContext)
}

export interface EffectiveBrand {
  name: string
  shortName: string
  logo: { light: string; dark: string }
  mark: string
  animated: { light: string; dark: string } | null
  colors: { primary: string; accent: string; gradient: string[] }
  assistant: { name: string; mascot: MascotSkin | null }
  /** Product storage namespace (`storage_namespace ?? key`); undefined without a product brand. */
  storageNamespace: string | undefined
}

const mascotColorKeys: Record<string, keyof MascotSkin['colors']> = {
  tire: 'tire',
  tread_or_tooth: 'treadOrTooth',
  accent: 'accent',
  glow: 'glow',
  screen: 'screen',
  screen_center: 'screenCenter',
}

/** Converts the manifest's snake_case mascot into the SDK `MascotSkin`; null when invalid. */
export function mascotFromManifest(m: BrandMascotSkin | undefined | null): MascotSkin | null {
  if (!m) return null
  const colors: Record<string, string> = {}
  for (const [k, v] of Object.entries(m.colors ?? {})) {
    const to = mascotColorKeys[k]
    if (to && typeof v === 'string') colors[to] = v
  }
  const skin = {
    id: m.id,
    name: m.name ?? '',
    toothShape: m.tooth_shape,
    antenna: !!m.antenna,
    screenTone: m.screen_tone,
    colors,
    ...(m.face
      ? {
          face: {
            ...(m.face.stroke ? { stroke: m.face.stroke } : {}),
            ...(m.face.stroke_width ? { strokeWidth: m.face.stroke_width } : {}),
            ...(m.face.tread_dot ? { treadDot: m.face.tread_dot } : {}),
          },
        }
      : {}),
  }
  return isValidSkin(skin) ? skin : null
}

const asset = (m: BrandManifest | null, mode: 'light' | 'dark', kind: 'logo' | 'mark' | 'animated') =>
  m ? pickLogo(m, mode, kind)?.url ?? '' : ''

/**
 * Pure precedence: product < organisation. A non-empty org field wins. Org
 * colours equal to the SDK fallback (what a tenant without branding reports)
 * are not an override.
 */
export function resolveBrand(
  product: BrandManifest | null,
  org: Partial<PlatformBranding> | undefined,
): EffectiveBrand {
  const o = org ?? {}
  const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : '')
  const orgColor = (v: string | undefined, fb: string) => (str(v) && v !== fb ? (v as string) : '')

  const orgLogo = str(o.platform_logo)
  const name = str(o.platform_name) || product?.name || ''
  const light = orgLogo || asset(product, 'light', 'logo')
  const dark = str(o.logo_dark) || orgLogo || asset(product, 'dark', 'logo')
  const animLight = asset(product, 'light', 'animated')
  const animDark = asset(product, 'dark', 'animated')
  const mascot =
    (isValidSkin(o.mascot) ? o.mascot : null) ?? mascotFromManifest(product?.assistant?.mascot)

  return {
    name,
    shortName: str(o.pwa_short_name) || (orgLogo || str(o.platform_name) ? name : product?.short_name || name),
    logo: { light, dark },
    mark: str(o.logo_mark) || asset(product, 'light', 'mark'),
    animated: animLight || animDark ? { light: animLight || animDark, dark: animDark || animLight } : null,
    colors: {
      primary:
        orgColor(o.primary_color, FALLBACK_BRANDING.primary_color) ||
        product?.theme?.primary ||
        product?.color ||
        '',
      accent:
        orgColor(o.accent_color, FALLBACK_BRANDING.accent_color) || product?.theme?.accent || '',
      gradient: product?.theme?.gradient ?? [],
    },
    assistant: {
      name: str(o.mascot_name) || product?.assistant?.name || '',
      mascot,
    },
    storageNamespace: product ? product.storage_namespace || product.key : undefined,
  }
}

/** Effective identity: product brand overlaid with the tenant's customisation. */
export function useBrand(): EffectiveBrand {
  const product = useProductBrand()
  const org = usePlatformConfig()
  return useMemo(() => resolveBrand(product, org), [product, org])
}

function useIsDark(enabled: boolean): boolean {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return
    const root = document.documentElement
    const read = () =>
      root.classList.contains('dark') ||
      (!root.classList.contains('light') &&
        typeof window !== 'undefined' &&
        !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)
    setDark(read())
    const obs = new MutationObserver(() => setDark(read()))
    obs.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [enabled])
  return dark
}

export interface BrandLogoProps {
  /** `auto` follows the `dark` class of `<html>` / `prefers-color-scheme`. */
  mode?: 'auto' | 'light' | 'dark'
  className?: string
  style?: CSSProperties
  alt?: string
  height?: number | string
}

/** Full product logo (wordmark), with the dark variant when the brand ships one. */
export function BrandLogo({ mode = 'auto', className, style, alt, height }: BrandLogoProps) {
  const brand = useBrand()
  const autoDark = useIsDark(mode === 'auto')
  const dark = mode === 'dark' || (mode === 'auto' && autoDark)
  const src = (dark ? brand.logo.dark : brand.logo.light) || brand.mark
  if (!src) return null
  return <img src={src} alt={alt ?? brand.name} height={height} className={className} style={style} />
}

const SWEEP_STYLE_ID = 'metacore-brand-sweep'
const SWEEP_CSS = `
@keyframes mc-brand-sweep { from { transform: translateX(-120%); } to { transform: translateX(120%); } }
.mc-brand-sweep { position: relative; display: inline-block; overflow: hidden; line-height: 0; }
.mc-brand-sweep::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(105deg, transparent 38%, var(--mc-brand-sweep, rgba(255,255,255,.55)) 50%, transparent 62%);
  animation: mc-brand-sweep 2.8s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .mc-brand-sweep::after { animation: none; display: none; } }
`

function useSweepStyles(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof document === 'undefined' || document.getElementById(SWEEP_STYLE_ID)) return
    const tag = document.createElement('style')
    tag.id = SWEEP_STYLE_ID
    tag.textContent = SWEEP_CSS
    document.head.appendChild(tag)
  }, [enabled])
}

export interface BrandMarkProps {
  /** Animate: the brand's own animated SVG when it ships one, else a CSS light sweep. */
  animated?: boolean
  mode?: 'auto' | 'light' | 'dark'
  size?: number
  className?: string
  style?: CSSProperties
  alt?: string
}

/** Square product mark. */
export function BrandMark({ animated = false, mode = 'auto', size = 32, className, style, alt }: BrandMarkProps) {
  const brand = useBrand()
  const autoDark = useIsDark(mode === 'auto')
  const dark = mode === 'dark' || (mode === 'auto' && autoDark)
  const own = animated && brand.animated ? (dark ? brand.animated.dark : brand.animated.light) : ''
  const sweep = animated && !own
  useSweepStyles(sweep)
  const src = own || brand.mark || (dark ? brand.logo.dark : brand.logo.light)
  if (!src) return null
  const img = <img src={src} alt={alt ?? brand.name} width={size} height={size} className={sweep ? undefined : className} style={sweep ? undefined : style} />
  if (!sweep) return img
  const tint = brand.colors.gradient[0]
  return (
    <span
      className={['mc-brand-sweep', className].filter(Boolean).join(' ')}
      style={{ ...(tint ? ({ '--mc-brand-sweep': tint } as CSSProperties) : null), ...style }}
    >
      {img}
    </span>
  )
}
