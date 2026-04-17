import { VitePWA, type VitePWAOptions } from 'vite-plugin-pwa'
import type { Plugin } from 'vite'

export interface MetacorePWAOptions extends Partial<VitePWAOptions> {
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
  const { apiUrlPattern = /^https:\/\/api\./i, manifest, workbox, injectManifest, devOptions, ...rest } = options

  const defaultManifest: VitePWAOptions['manifest'] = {
    name: 'Metacore App',
    short_name: 'Metacore',
    description: 'A Metacore-powered application',
    theme_color: '#84cc16',
    background_color: '#1a2e05',
    start_url: '/',
    display: 'standalone',
    icons: [],
  }

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
