// Idioma del CONTENIDO por llamada (`options.locale`): cabeceras, ?locale= explícito, normalización y regresión cero.
import { describe, expect, it, vi } from 'vitest'
import { LOCALE_HEADER, createStorefrontClient, normalizeLocale } from './index.js'

type Call = { url: string; init: RequestInit & { headers: Headers } }

function recorder() {
  const calls: Call[] = []
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init as Call['init'] })
    return Response.json({ nodes: [], page_info: { has_next_page: false, end_cursor: null }, facets: [] })
  })
  return { calls, fetch }
}

const base = { baseUrl: 'https://ops.example.com/api/gw/', token: 'sk_test' }

describe('normalizeLocale', () => {
  it('reduces a region tag to its language, in lower case', () => {
    expect(normalizeLocale('es-US')).toBe('es')
    expect(normalizeLocale('ES_mx')).toBe('es')
    expect(normalizeLocale('  en  ')).toBe('en')
    expect(normalizeLocale('fil')).toBe('fil')
  })
  it('drops anything that is not a language, so it never reaches the wire', () => {
    for (const bad of ['', '   ', '*', 'e', 'espanol', '12', '-US', undefined, null, 5, {}]) expect(normalizeLocale(bad)).toBeUndefined()
  })
})

describe('locale per call', () => {
  it('sends X-Storefront-Locale, Accept-Language and an explicit ?locale= on reads', async () => {
    const { calls, fetch } = recorder()
    const sf = createStorefrontClient({ ...base, fetch })
    await sf.products.list({ first: 5 }, { locale: 'es-US' })
    const call = calls[0]!
    expect(call.url).toBe('https://ops.example.com/api/gw/storefront/products?first=5&locale=es')
    expect(call.init.headers.get(LOCALE_HEADER)).toBe('es')
    expect(call.init.headers.get('X-Storefront-Locale')).toBe('es')
    expect(call.init.headers.get('Accept-Language')).toBe('es')
  })

  it('works on every read: product, collections and shop', async () => {
    const { calls, fetch } = recorder()
    const sf = createStorefrontClient({ ...base, fetch })
    await sf.products.get('god-s-protein', { locale: 'es' })
    await sf.collections.list(undefined, { locale: 'es' })
    await sf.shop.get({ locale: 'es' })
    expect(calls.map((c) => c.url)).toEqual([
      'https://ops.example.com/api/gw/storefront/products/god-s-protein?locale=es',
      'https://ops.example.com/api/gw/storefront/collections?locale=es',
      'https://ops.example.com/api/gw/storefront/shop?locale=es',
    ])
    for (const c of calls) expect(c.init.headers.get('X-Storefront-Locale')).toBe('es')
  })

  it('beats the client-level locale for this call only', async () => {
    const { calls, fetch } = recorder()
    const sf = createStorefrontClient({ ...base, fetch, locale: 'en-US' })
    await sf.products.list({}, { locale: 'es' })
    await sf.products.list({})
    expect(calls[0]!.init.headers.get('Accept-Language')).toBe('es')
    expect(calls[1]!.init.headers.get('Accept-Language')).toBe('en-US')
    expect(calls[1]!.init.headers.get(LOCALE_HEADER)).toBeNull()
  })

  it('does not add ?locale= to writes (only the headers), keeping write URLs stable', async () => {
    const { calls, fetch } = recorder()
    const sf = createStorefrontClient({ ...base, fetch })
    await sf.carts.create({}, { locale: 'es' })
    const call = calls[0]!
    expect(call.init.method).toBe('POST')
    expect(call.url).not.toContain('locale=')
    expect(call.init.headers.get(LOCALE_HEADER)).toBe('es')
  })

  it('keeps a route-level locale param (address suggest) and does not duplicate it', async () => {
    const { calls, fetch } = recorder()
    const sf = createStorefrontClient({ ...base, fetch })
    await sf.addressSuggest({ q: 'main st', locale: 'en' }, { locale: 'es' })
    expect(new URL(calls[0]!.url).searchParams.getAll('locale')).toEqual(['en'])
  })

  it('does not mutate a URLSearchParams passed by the caller and forwards no `locale` to fetch', async () => {
    const { calls, fetch } = recorder()
    const sf = createStorefrontClient({ ...base, fetch })
    await sf.products.list({}, { locale: 'es', cache: 'no-store' })
    expect(calls[0]!.init).not.toHaveProperty('locale')
    expect(calls[0]!.init.cache).toBe('no-store')
  })

  it('ignores an invalid per-call locale and lets the explicit headers option win', async () => {
    const { calls, fetch } = recorder()
    const sf = createStorefrontClient({ ...base, fetch })
    await sf.products.list({}, { locale: '***' })
    expect(calls[0]!.url).not.toContain('locale=')
    expect(calls[0]!.init.headers.get(LOCALE_HEADER)).toBeNull()
    await sf.products.list({}, { locale: 'es', headers: { 'Accept-Language': 'fr' } })
    expect(calls[1]!.init.headers.get('Accept-Language')).toBe('fr')
  })
})

describe('no locale per call: nothing changes (zero regression)', () => {
  it('sends the same URL and headers as before', async () => {
    const { calls, fetch } = recorder()
    const sf = createStorefrontClient({ ...base, fetch, locale: 'es-MX' })
    await sf.products.list({ first: 5 })
    const call = calls[0]!
    expect(call.url).toBe('https://ops.example.com/api/gw/storefront/products?first=5')
    expect(call.init.headers.get('Accept-Language')).toBe('es-MX')
    expect(call.init.headers.get(LOCALE_HEADER)).toBeNull()
  })
})
