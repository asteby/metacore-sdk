import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { parseBrand } from '@asteby/metacore-sdk/brand'
import {
  BrandLogo,
  BrandMark,
  ProductBrandProvider,
  loadProductBrand,
  mascotFromManifest,
  resolveBrand,
} from '../src/brand'
import { FALLBACK_BRANDING } from '../src/platform-config-provider'

const raw = (extra: Record<string, unknown> = {}) => ({
  spec: 1,
  key: 'vantora',
  name: 'Vantora',
  storage_namespace: 'vnt',
  theme: { primary: '#0033f0', accent: '#00fcff', gradient: ['#00fcff', '#0033f0'] },
  assistant: { name: 'Vera' },
  assets: {
    icon: { url: '/api/brand/icon', type: 'image/svg+xml' },
    logo: { url: '/api/brand/logo', type: 'image/svg+xml' },
    logo_dark: { url: '/api/brand/logo-dark', type: 'image/svg+xml' },
  },
  ...extra,
})
const manifest = parseBrand(raw())!

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

describe('resolveBrand', () => {
  it('uses the product brand when the org customises nothing', () => {
    const b = resolveBrand(manifest, FALLBACK_BRANDING)
    expect(b.name).toBe('Vantora')
    expect(b.logo).toEqual({ light: '/api/brand/logo', dark: '/api/brand/logo-dark' })
    expect(b.colors.primary).toBe('#0033f0')
    expect(b.assistant.name).toBe('Vera')
    expect(b.storageNamespace).toBe('vnt')
  })

  it('org fields win over the product (org > product)', () => {
    const b = resolveBrand(manifest, {
      ...FALLBACK_BRANDING,
      platform_name: 'Acme',
      platform_logo: '/acme.svg',
      primary_color: '#112233',
      mascot_name: 'Ana',
    })
    expect(b.name).toBe('Acme')
    expect(b.logo).toEqual({ light: '/acme.svg', dark: '/acme.svg' })
    expect(b.colors.primary).toBe('#112233')
    expect(b.assistant.name).toBe('Ana')
    expect(resolveBrand(manifest, { logo_dark: '/acme-dark.svg', platform_logo: '/acme.svg' }).logo.dark).toBe('/acme-dark.svg')
  })

  it('works without a product brand', () => {
    const b = resolveBrand(null, { platform_name: 'Solo' })
    expect(b.name).toBe('Solo')
    expect(b.storageNamespace).toBeUndefined()
  })

  it('falls back to key when storage_namespace is absent', () => {
    expect(resolveBrand(parseBrand(raw({ storage_namespace: undefined }))!, undefined).storageNamespace).toBe('vantora')
  })
})

describe('mascotFromManifest', () => {
  const skin = {
    id: 'vantora',
    tooth_shape: 'hex-frame',
    antenna: false,
    screen_tone: 'dark',
    colors: { tire: '#1', tread_or_tooth: '#2', accent: '#3', glow: '#4', screen: '#5', screen_center: '#6' },
    face: { stroke: '#fff', stroke_width: 6, tread_dot: '#eee' },
  }
  it('maps snake_case to a valid MascotSkin', () => {
    const m = mascotFromManifest(skin)!
    expect(m.toothShape).toBe('hex-frame')
    expect(m.colors.screenCenter).toBe('#6')
    expect(m.face).toEqual({ stroke: '#fff', strokeWidth: 6, treadDot: '#eee' })
  })
  it('rejects incomplete skins', () => {
    expect(mascotFromManifest({ ...skin, colors: { tire: '#1' } })).toBeNull()
    expect(mascotFromManifest(undefined)).toBeNull()
  })
})

describe('ProductBrandProvider first frame', () => {
  it('paints window.__PRODUCT_BRAND__ before any fetch', () => {
    ;(globalThis as { window?: unknown }).window = { __PRODUCT_BRAND__: raw({ name: 'Inlined' }) }
    const html = renderToStaticMarkup(
      createElement(ProductBrandProvider, null, createElement(BrandLogo, { mode: 'light' })),
    )
    expect(html).toContain('alt="Inlined"')
    expect(html).toContain('src="/api/brand/logo"')
  })

  it('falls back to the localStorage copy', () => {
    const store: Record<string, string> = { 'mc:product-brand:v1': JSON.stringify({ etag: '"a"', manifest: raw({ name: 'Cached' }) }) }
    ;(globalThis as { window?: unknown }).window = {
      localStorage: { getItem: (k: string) => store[k] ?? null, setItem: () => {} },
    }
    const html = renderToStaticMarkup(
      createElement(ProductBrandProvider, null, createElement(BrandLogo, { mode: 'light' })),
    )
    expect(html).toContain('alt="Cached"')
  })
})

describe('BrandLogo / BrandMark', () => {
  it('picks the dark logo in dark mode and the light one otherwise', () => {
    const dark = renderToStaticMarkup(
      createElement(ProductBrandProvider, { initial: manifest }, createElement(BrandLogo, { mode: 'dark' })),
    )
    expect(dark).toContain('src="/api/brand/logo-dark"')
    const light = renderToStaticMarkup(
      createElement(ProductBrandProvider, { initial: manifest }, createElement(BrandLogo, { mode: 'light' })),
    )
    expect(light).toContain('src="/api/brand/logo"')
  })

  it('animated mark without an animated asset uses the CSS sweep wrapper', () => {
    const html = renderToStaticMarkup(
      createElement(ProductBrandProvider, { initial: manifest }, createElement(BrandMark, { animated: true, mode: 'light' })),
    )
    expect(html).toContain('mc-brand-sweep')
    expect(html).toContain('src="/api/brand/icon"')
  })
})

describe('loadProductBrand', () => {
  const mk = (status: number, body: unknown, etag?: string) =>
    (async (_url: string, init?: RequestInit) => {
      calls.push((init?.headers ?? {}) as Record<string, string>)
      return {
        status,
        ok: status >= 200 && status < 300,
        json: async () => body,
        headers: { get: (h: string) => (h === 'ETag' ? etag ?? null : null) },
      }
    }) as unknown as typeof fetch
  const calls: Array<Record<string, string>> = []

  it('sends If-None-Match and keeps the cache on 304', async () => {
    calls.length = 0
    const r = await loadProductBrand({ etag: '"v1"', fetch: mk(304, null) })
    expect(r).toEqual({ status: 'not-modified' })
    expect(calls[0]!['If-None-Match']).toBe('"v1"')
  })

  it('parses a 200 and returns the ETag', async () => {
    const r = await loadProductBrand({ fetch: mk(200, raw(), '"v2"') })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.etag).toBe('"v2"')
      expect(r.manifest.key).toBe('vantora')
    }
  })
})
