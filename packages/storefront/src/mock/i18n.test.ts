// Mock con traducciones: misma resolución de idioma que el servidor, fallback por campo y cero cambio sin la opción.
import { describe, expect, it } from 'vitest'
import { createStorefrontClient } from '../index.js'
import { createMockStorefront } from './index.js'
import { acceptLanguages, resolveContentLocale } from './i18n.js'

const client = (mock: ReturnType<typeof createMockStorefront>, locale?: string) =>
  createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch, ...(locale ? { locale } : {}) })

const TRANSLATIONS = {
  products: {
    // El español es el idioma de origen de la tienda de ejemplo: lo traducido es el inglés. Solo título, HTML y título SEO: el resto cae al original.
    'playera-basica': { en: { title: 'Basic tee', description_html: '<p>Hello</p>', seo_title: 'Basic tee | Shop' } },
  },
  collections: { ropa: { en: { title: 'Clothing', description: 'Everyday basics.' } } },
}

describe('acceptLanguages', () => {
  it('orders by weight, keeps only valid languages and drops repeats', () => {
    expect(acceptLanguages('es-MX;q=0.5, en-US, fr;q=0.8, *;q=0.1, en')).toEqual(['en', 'fr', 'es'])
    expect(acceptLanguages('')).toEqual([])
    expect(acceptLanguages(null)).toEqual([])
    expect(acceptLanguages('es;q=0')).toEqual([])
  })
})

describe('resolveContentLocale', () => {
  const headers = (h: Record<string, string>) => new Headers(h)
  const input = (search: string, h: Record<string, string>) => ({ search: new URLSearchParams(search), headers: headers(h), available: ['es', 'en'], fallback: 'es' })
  it('?locale= beats X-Storefront-Locale beats Accept-Language beats the default', () => {
    expect(resolveContentLocale(input('locale=en', { 'x-storefront-locale': 'es', 'accept-language': 'es' }))).toBe('en')
    expect(resolveContentLocale(input('', { 'x-storefront-locale': 'en', 'accept-language': 'es' }))).toBe('en')
    expect(resolveContentLocale(input('', { 'accept-language': 'en-US,es;q=0.5' }))).toBe('en')
    expect(resolveContentLocale(input('', {}))).toBe('es')
  })
  it('ignores a language the shop does not offer and moves on (never an error)', () => {
    expect(resolveContentLocale(input('locale=fr', { 'accept-language': 'en' }))).toBe('en')
    expect(resolveContentLocale(input('locale=fr', {}))).toBe('es')
    expect(resolveContentLocale(input('locale=%%%', { 'accept-language': 'xx,en' }))).toBe('en')
  })
})

describe('mock with translations', () => {
  it('serves the translated fields and falls back to the original per field', async () => {
    const mock = createMockStorefront({ translations: TRANSLATIONS })
    const sf = client(mock)
    const original = (await sf.products.get('playera-basica'))!
    const en = (await sf.products.get('playera-basica', { locale: 'en' }))!
    expect(en.title).toBe('Basic tee')
    expect(en.description_html).toBe('<p>Hello</p>')
    expect(en.seo.title).toBe('Basic tee | Shop')
    // Not translated: stays as the original, field by field.
    expect(en.description).toBe(original.description)
    expect(en.seo.description).toBe(original.seo.description)
    expect(en.handle).toBe(original.handle)
    expect(en.variants).toEqual(original.variants)
  })

  it('the default language of the shop (es-MX) is served untouched even if a table exists for it', async () => {
    const mock = createMockStorefront({ translations: { products: { 'playera-basica': { es: { title: 'NO' } } } } })
    const sf = client(mock)
    expect((await sf.products.get('playera-basica', { locale: 'es' }))!.title).toBe('Playera básica')
  })

  it('translates lists, recommendations and collections by language', async () => {
    const mock = createMockStorefront({ translations: TRANSLATIONS })
    const sf = client(mock)
    const list = await sf.products.list({ first: 50 }, { locale: 'en' })
    expect(list.nodes.find((p) => p.handle === 'playera-basica')!.title).toBe('Basic tee')
    expect(list.nodes.find((p) => p.handle === 'playera-basica')!.seo.title).toBe('Basic tee | Shop')
    const col = await sf.collections.get('ropa', { locale: 'en' })
    expect(col!.title).toBe('Clothing')
    expect((await sf.collections.list(undefined, { locale: 'en' })).nodes.find((c) => c.handle === 'ropa')!.description).toBe('Everyday basics.')
    expect((await sf.collections.get('ropa'))!.title).toBe('Ropa')
  })

  it('resolves the language from the client-level Accept-Language when nothing per call is given', async () => {
    const mock = createMockStorefront({ translations: TRANSLATIONS })
    expect((await client(mock, 'en-US').products.get('playera-basica'))!.title).toBe('Basic tee')
    expect((await client(mock, 'fr-FR').products.get('playera-basica'))!.title).toBe('Playera básica')
  })

  it('answers Content-Language (the language really served) and Vary', async () => {
    const mock = createMockStorefront({ translations: TRANSLATIONS })
    const get = (qs: string) => mock.fetch(`https://mock.local/api/gw/storefront/products/playera-basica${qs}`, { headers: { Authorization: 'Bearer sk_mock' } })
    const en = await get('?locale=en')
    expect(en.headers.get('content-language')).toBe('en')
    expect(en.headers.get('vary')).toContain('Accept-Language')
    expect(en.headers.get('vary')).toContain('X-Storefront-Locale')
    expect((await get('?locale=fr')).headers.get('content-language')).toBe('es')
    // Different bodies per language must not share an ETag.
    expect(en.headers.get('etag')).not.toBe((await get('')).headers.get('etag'))
  })

  it('adds the translated languages to shop.locales without repeating a language already there', async () => {
    const sf = client(createMockStorefront({ translations: { products: { 'playera-basica': { pt: { title: 'Camiseta' } } } } }))
    expect((await sf.shop.get()).locales).toEqual(['es-MX', 'en-US', 'pt'])
    const sf2 = client(createMockStorefront({ translations: TRANSLATIONS }))
    expect((await sf2.shop.get()).locales).toEqual(['es-MX', 'en-US'])
  })
})

describe('mock without translations: unchanged behavior', () => {
  it('sends no Content-Language or language Vary and ignores ?locale=', async () => {
    const mock = createMockStorefront()
    const res = await mock.fetch('https://mock.local/api/gw/storefront/products/playera-basica?locale=en', { headers: { Authorization: 'Bearer sk_mock' } })
    expect(res.headers.get('content-language')).toBeNull()
    expect(res.headers.get('vary')).toBeNull()
    const sf = client(mock)
    expect((await sf.shop.get()).locales).toEqual(['es-MX', 'en-US'])
    expect((await sf.products.get('playera-basica', { locale: 'en' }))!.title).toBe('Playera básica')
  })
})
