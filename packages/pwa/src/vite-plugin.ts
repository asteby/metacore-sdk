import { VitePWA, type VitePWAOptions } from 'vite-plugin-pwa'
import type { Plugin } from 'vite'
import { readFileSync } from 'node:fs'

/** Subset of the product brand manifest (`GET /api/brand`) the plugin reads. */
export interface PWABrand {
  name: string
  short_name?: string
  description?: string
  color?: string
  theme?: { primary?: string; theme_color?: string; background?: string; background_color?: string }
  assets?: {
    icon?: PWABrandAsset
    maskable?: PWABrandAsset
    monochrome?: PWABrandAsset
  }
}
/** `{ url, type, width?, height? }` as served by `/api/brand`, or a bare `src` string. */
export type PWABrandAsset = string | { url: string; type?: string; width?: number; height?: number }

type ManifestIcon = { src: string; sizes?: string; type?: string; purpose?: string }

const NEUTRAL_THEME = '#0f172a'
const NEUTRAL_BACKGROUND = '#ffffff'

function iconOf(a: PWABrandAsset | undefined, purpose: string, sizes: string): ManifestIcon | null {
  if (!a) return null
  const src = typeof a === 'string' ? a : a.url
  if (!src) return null
  const type = typeof a === 'string' ? undefined : a.type
  const own = typeof a === 'string' ? undefined : a.width && a.height ? `${a.width}x${a.height}` : undefined
  return { src, sizes: own ?? sizes, ...(type ? { type } : {}), purpose }
}

/**
 * Web-app-manifest fields derived from a product brand: name, short_name,
 * description, colours and icons (icon `any`, maskable PNG `maskable`,
 * monochrome SVG `monochrome`). Missing colours fall back to neutral values.
 */
export function brandToManifest(brand: PWABrand): Record<string, unknown> {
  const t = brand.theme ?? {}
  const icons = [
    iconOf(brand.assets?.icon, 'any', 'any'),
    iconOf(brand.assets?.maskable, 'maskable', '512x512'),
    iconOf(brand.assets?.monochrome, 'monochrome', 'any'),
  ].filter((i): i is ManifestIcon => !!i)
  return {
    name: brand.name,
    short_name: brand.short_name || brand.name,
    ...(brand.description ? { description: brand.description } : {}),
    theme_color: t.theme_color || t.primary || brand.color || NEUTRAL_THEME,
    background_color: t.background_color || t.background || NEUTRAL_BACKGROUND,
    icons,
  }
}

function loadBrand(brand: string | PWABrand): PWABrand {
  if (typeof brand !== 'string') return brand
  return JSON.parse(readFileSync(brand, 'utf8')) as PWABrand
}

let warnedLegacyDefaults = false

export interface MetacorePWAOptions extends Partial<VitePWAOptions> {
  /**
   * Product brand to fill the web-app manifest from: a brand manifest object
   * or a path to a JSON file with its shape (`/api/brand`). Explicit
   * `manifest` fields still win over it.
   */
  brand?: string | PWABrand
  /**
   * Regex that matches API URLs to cache with NetworkFirst.
   * Default: `/^https:\/\/api\./i`
   */
  apiUrlPattern?: RegExp
}

/**
 * Thin wrapper around `vite-plugin-pwa`'s `VitePWA()` with sensible
 * Metacore defaults:
 *   - `registerType: 'prompt'`
 *   - `strategies: 'injectManifest'` with `srcDir: 'src'`, `filename: 'sw.js'`
 *   - Workbox runtime caching for API (NetworkFirst), Google Fonts (SWR + CacheFirst)
 *   - Dev mode enabled
 *
 * Any option passed in `options` overrides the defaults. Plain object fields
 * like `manifest` and `workbox` are shallow-merged so callers can override a
 * single key without losing all defaults.
 */
export function metacorePWA(options: MetacorePWAOptions = {}): Plugin[] {
  const { apiUrlPattern = /^https:\/\/api\./i, brand, manifest, workbox, injectManifest, devOptions, ...rest } = options

  const fromBrand = brand ? brandToManifest(loadBrand(brand)) : null
  if (!fromBrand && !(manifest && manifest.name) && !warnedLegacyDefaults) {
    warnedLegacyDefaults = true
    console.warn(
      '[metacore-pwa] No `brand` or `manifest.name` given: using the legacy default manifest ' +
        '("Metacore App", lime theme). These defaults will become neutral in a future major; ' +
        'pass `brand` (from /api/brand) or `manifest` explicitly.',
    )
  }

  const defaultManifest: VitePWAOptions['manifest'] = {
    name: 'Metacore App',
    short_name: 'Metacore',
    description: 'A Metacore-powered application',
    theme_color: '#84cc16',
    background_color: '#1a2e05',
    start_url: '/',
    display: 'standalone',
    icons: [],
    ...(fromBrand ?? {}),
  } as VitePWAOptions['manifest']

  const defaultWorkbox: VitePWAOptions['workbox'] = {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
    runtimeCaching: [
      {
        urlPattern: ({ url }) => apiUrlPattern.test(url.href),
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api-cache',
          cacheableResponse: { statuses: [0, 200] },
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 * 24,
          },
        },
      },
      {
        urlPattern: ({ url }) => /^https:\/\/fonts\.googleapis\.com/.test(url.href),
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'google-fonts-stylesheets',
        },
      },
      {
        urlPattern: ({ url }) => /^https:\/\/fonts\.gstatic\.com/.test(url.href),
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-webfonts',
          cacheableResponse: { statuses: [0, 200] },
          expiration: {
            maxEntries: 30,
            maxAgeSeconds: 60 * 60 * 24 * 365,
          },
        },
      },
    ],
  }

  const defaultInjectManifest: VitePWAOptions['injectManifest'] = {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
  }

  const defaultDevOptions: VitePWAOptions['devOptions'] = {
    enabled: true,
    type: 'module',
  }

  const merged: Partial<VitePWAOptions> = {
    strategies: 'injectManifest',
    srcDir: 'src',
    filename: 'sw.ts',
    registerType: 'prompt',
    includeAssets: ['images/**/*'],
    ...rest,
    manifest: { ...defaultManifest, ...(manifest ?? {}) },
    workbox: { ...defaultWorkbox, ...(workbox ?? {}) },
    injectManifest: { ...defaultInjectManifest, ...(injectManifest ?? {}) },
    devOptions: { ...defaultDevOptions, ...(devOptions ?? {}) },
  }

  return VitePWA(merged)
}
