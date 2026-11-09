import { describe, expect, it, vi } from 'vitest'
import {
  aiReferrer,
  canonicalOrigin,
  CLOSED_ROBOTS_TXT,
  CLOSED_X_ROBOTS,
  crawlerGroups,
  crawlerPolicyFromEnv,
  indexingEnabled,
  indexNowKeyResponse,
  isFilteredListingUrl,
  ga4AddToCart,
  ga4BeginCheckout,
  ga4Bootstrap,
  ga4Item,
  ga4Purchase,
  ga4ViewItem,
  isIndexNowKey,
  llmsFullTxt,
  llmsTxt,
  renderSitemap,
  renderSitemapIndex,
  submitIndexNow,
} from './seo-kit.js'
import { robotsTxt, variantGtin } from './merchant.js'

const money = (amount: string, currency_code = 'MXN') => ({ amount, currency_code })

describe('canonicalOrigin', () => {
  it('uses configured https without www/trailing slash; falls back otherwise', () => {
    expect(canonicalOrigin('https://www.x.com/', 'https://y.com')).toBe('https://x.com')
    expect(canonicalOrigin('http://x.com', 'https://y.com')).toBe('https://y.com')
    expect(canonicalOrigin('http://localhost:5173', 'https://y.com')).toBe('http://localhost:5173')
    expect(canonicalOrigin(undefined, 'https://y.com')).toBe('https://y.com')
    expect(canonicalOrigin('nonsense', 'https://y.com')).toBe('https://y.com')
  })
})

describe('sitemaps', () => {
  it('writes hreflang alternates, lastmod and raster images only; escapes XML', () => {
    const xml = renderSitemap(
      [{ loc: 'https://s.com/mx/a?x=1&y=2', lastmod: '2026-11-01T10:00:00Z', images: ['https://s.com/a.jpg', 'https://s.com/b.svg'] }, { loc: 'https://s.com/mx/b', lastmod: 'garbage' }],
      { alternatesFor: (loc) => [{ hrefLang: 'es-MX', href: loc }] },
    )
    expect(xml).toContain('<loc>https://s.com/mx/a?x=1&amp;y=2</loc><lastmod>2026-11-01</lastmod>')
    expect(xml).toContain('hreflang="es-MX"')
    expect(xml).toContain('<image:loc>https://s.com/a.jpg</image:loc>')
    expect(xml).not.toContain('b.svg')
    expect(xml).not.toMatch(/garbage/)
  })
  it('caps at 50 000 urls and builds the index', () => {
    const many = Array.from({ length: 50_005 }, (_, i) => ({ loc: `https://s.com/${i}` }))
    expect(renderSitemap(many).match(/<url>/g)).toHaveLength(50_000)
    expect(renderSitemapIndex(['https://s.com/mx/sitemap.xml'])).toContain('<sitemap><loc>https://s.com/mx/sitemap.xml</loc></sitemap>')
  })
})

describe('crawler policy', () => {
  it('names search, AI-search and user agents as allowed; blocks training by default', () => {
    const g = crawlerGroups()
    for (const a of ['Googlebot', 'Bingbot', 'OAI-SearchBot', 'PerplexityBot', 'Claude-SearchBot', 'ChatGPT-User']) expect(g.allow).toContain(a)
    for (const a of ['GPTBot', 'CCBot', 'ClaudeBot', 'Google-Extended']) expect(g.block).toContain(a)
  })
  it('training: allow opens them; per-agent overrides win (case-insensitive)', () => {
    expect(crawlerGroups({ training: 'allow' }).block).toEqual([])
    const g = crawlerGroups({ agents: { gptbot: 'allow', PerplexityBot: 'block', NewBot: 'block' } })
    expect(g.allow).toContain('GPTBot')
    expect(g.block).toEqual(expect.arrayContaining(['PerplexityBot', 'NewBot', 'CCBot']))
    expect(g.allow).not.toContain('PerplexityBot')
  })
  it('robotsTxt honours the policy and keeps the sitemap line', () => {
    const body = robotsTxt({ policy: { training: 'allow' }, disallow: ['/cart'], sitemaps: ['https://s.com/sitemap.xml'] })
    expect(body).toContain('User-agent: GPTBot\n')
    expect(body).not.toMatch(/Disallow: \/\n/)
    expect(body).toContain('Disallow: /cart')
    expect(body).toContain('Sitemap: https://s.com/sitemap.xml')
  })
})

describe('llms.txt', () => {
  const input = {
    name: 'Tienda',
    summary: 'Suplementos   con\nlaboratorio.',
    sections: [{ title: 'Catálogo', links: [{ title: 'Whey', url: 'https://s.com/mx/productos/whey', note: 'Proteína' }, { title: 'Vacía', url: 'https://s.com/x' }] }, { title: 'Nada', links: [] }],
    policies: [{ title: 'Envíos', text: 'Texto real.' }],
    faq: [{ question: '¿Cuánto tarda?', answer: '2 a 5 días.' }],
    contact: { email: 'a@b.com' },
  }
  it('llms.txt: H1, quote, link sections (empty sections skipped)', () => {
    expect(llmsTxt(input)).toBe('# Tienda\n\n> Suplementos con laboratorio.\n\n## Catálogo\n\n- [Whey](https://s.com/mx/productos/whey): Proteína\n- [Vacía](https://s.com/x)\n')
  })
  it('llms-full.txt adds policies, FAQ and contact only when present', () => {
    const full = llmsFullTxt(input)
    expect(full).toContain('## Policies\n\n### Envíos\n\nTexto real.')
    expect(full).toContain('### ¿Cuánto tarda?\n\n2 a 5 días.')
    expect(full).toContain('- Email: a@b.com')
    expect(llmsFullTxt({ name: 'T', summary: 's', sections: [] })).not.toMatch(/FAQ|Contact|Policies/)
  })
})

describe('IndexNow', () => {
  it('validates keys', () => {
    expect(isIndexNowKey('abcdef12-3456')).toBe(true)
    for (const k of ['short', 'has space 12345', 'x'.repeat(129), '', null]) expect(isIndexNowKey(k as string)).toBe(false)
  })
  it('posts only same-host, deduplicated urls with the key location; reports 200/202 as ok', async () => {
    const f = vi.fn(async () => new Response('', { status: 202 }))
    const r = await submitIndexNow({ host: 'godsnutrition.com', key: 'abcdef123456', urls: ['https://godsnutrition.com/mx', 'https://godsnutrition.com/mx', 'https://otro.com/x', 'basura'], fetch: f as never })
    expect(r).toEqual([{ ok: true, status: 202, submitted: 1 }])
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body)
    expect(body).toEqual({ host: 'godsnutrition.com', key: 'abcdef123456', keyLocation: 'https://godsnutrition.com/abcdef123456.txt', urlList: ['https://godsnutrition.com/mx'] })
  })
  it('does nothing without urls and rejects a bad key', async () => {
    const f = vi.fn()
    expect(await submitIndexNow({ host: 'a.com', key: 'abcdef123456', urls: [], fetch: f as never })).toEqual([])
    expect(f).not.toHaveBeenCalled()
    await expect(submitIndexNow({ host: 'a.com', key: 'bad', urls: ['https://a.com/'] })).rejects.toThrow()
  })
})

describe('GA4 events', () => {
  const product = { id: 'p1', title: 'Whey', vendor: "God's", category: { handle: 'p', title: 'Proteínas' } } as never
  const variant = { id: 'v1', sku: 'WH-1', title: 'Chocolate / 2 lb', price: money('900.00') } as never
  it('item and events carry currency, value and market; nothing invented', () => {
    const item = ga4Item(product, variant, 2)
    expect(item).toEqual({ item_id: 'WH-1', item_name: 'Whey', quantity: 2, item_brand: "God's", item_category: 'Proteínas', item_variant: 'Chocolate / 2 lb', price: 900 })
    expect(ga4ViewItem(ga4Item(product, variant), 'MXN', 'mx').params).toMatchObject({ currency: 'MXN', value: 900, market: 'mx' })
    expect(ga4AddToCart(item, 'MXN', 'mx').params.value).toBe(1800)
    expect(ga4BeginCheckout([item], 'MXN', 'mx', money('1950.50')).params.value).toBe(1950.5)
  })
  it('purchase needs the order number and uses charged totals', () => {
    const e = ga4Purchase({ transactionId: 'GN-1', items: [ga4Item(product, variant)], total: money('52.30', 'USD'), tax: money('3.30', 'USD'), shipping: money('8', 'USD'), market: 'us' })
    expect(e.event).toBe('purchase')
    expect(e.params).toMatchObject({ transaction_id: 'GN-1', currency: 'USD', value: 52.3, tax: 3.3, shipping: 8, market: 'us' })
  })
  it('bootstrap only for a well-formed measurement id', () => {
    expect(ga4Bootstrap('G-ABC123DEF4', 'mx')).toContain("gtag('config',\"G-ABC123DEF4\",{ market: \"mx\" })")
    for (const bad of ['', null, 'UA-1', 'G-"x"</script>']) expect(ga4Bootstrap(bad as string)).toBe('')
  })
  it('recognises AI assistant referrers', () => {
    expect(aiReferrer('https://chatgpt.com/')).toBe('chatgpt.com')
    expect(aiReferrer('https://www.perplexity.ai/search?q=x')).toBe('perplexity.ai')
    expect(aiReferrer('https://www.google.com/')).toBeNull()
    expect(aiReferrer('nope')).toBeNull()
  })
})

describe('operational switches', () => {
  it('indexingEnabled: on by default, SEO_INDEXING=off closes', () => {
    expect(indexingEnabled({})).toBe(true)
    expect(indexingEnabled({ SEO_INDEXING: 'on' })).toBe(true)
    for (const v of ['off', 'FALSE', '0', 'no', ' off ']) expect(indexingEnabled({ SEO_INDEXING: v })).toBe(false)
    expect(CLOSED_ROBOTS_TXT).toBe('User-agent: *\nDisallow: /\n')
    expect(CLOSED_X_ROBOTS).toBe('noindex, nofollow')
  })
  it('crawlerPolicyFromEnv: shop default, env wins, overrides validated', () => {
    expect(crawlerPolicyFromEnv({})).toEqual({ training: 'block', agents: {} })
    expect(crawlerPolicyFromEnv({}, { training: 'allow' }).training).toBe('allow')
    expect(crawlerPolicyFromEnv({ AI_TRAINING_CRAWLERS: 'block' }, { training: 'allow' }).training).toBe('block')
    expect(crawlerPolicyFromEnv({ CRAWLER_OVERRIDES: 'GPTBot=allow, CCBot=block, x=allow, Bad Name=allow, Foo=maybe' }).agents).toEqual({ GPTBot: 'allow', CCBot: 'block' })
  })
  it('isFilteredListingUrl: filters/order/page yes, campaign no, empty values no', () => {
    expect(isFilteredListingUrl('https://x.test/c?f.marca=a')).toBe(true)
    expect(isFilteredListingUrl('https://x.test/c?orden=precio')).toBe(true)
    expect(isFilteredListingUrl('https://x.test/c?utm_source=a&gclid=b')).toBe(false)
    expect(isFilteredListingUrl('https://x.test/c?orden=')).toBe(false)
    expect(isFilteredListingUrl('https://x.test/c?sort=1', ['sort'])).toBe(true)
  })
  it('variantGtin: valid barcode, else valid SKU, never an invalid code', () => {
    expect(variantGtin({ barcode: '4006381333931' })).toBe('4006381333931')
    expect(variantGtin({ barcode: '4006381333932', sku: '4006381333931' })).toBe('4006381333931')
    expect(variantGtin({ barcode: null, sku: '4006381333931' }, { env: { GTIN_FROM_SKU: 'off' } })).toBeNull()
    expect(variantGtin({ barcode: '123', sku: 'ABC-1' })).toBeNull()
  })
  it('indexNowKeyResponse: only GET/HEAD of /<key>.txt with a valid key', async () => {
    const key = 'abcdef1234567890'
    const res = indexNowKeyResponse({ method: 'GET', url: `https://x.test/${key}.txt` }, key)
    expect(await res?.text()).toBe(key)
    expect(indexNowKeyResponse({ method: 'POST', url: `https://x.test/${key}.txt` }, key)).toBeNull()
    expect(indexNowKeyResponse({ method: 'GET', url: 'https://x.test/other.txt' }, key)).toBeNull()
    expect(indexNowKeyResponse({ method: 'GET', url: 'https://x.test/short.txt' }, 'short')).toBeNull()
    expect(indexNowKeyResponse({ method: 'GET', url: `https://x.test/${key}.txt` }, undefined)).toBeNull()
  })
})
