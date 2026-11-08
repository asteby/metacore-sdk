import { describe, expect, it } from 'vitest'
import {
  collectFeed,
  feedAmount,
  feedPrice,
  googleFeedTsv,
  googleFeedXml,
  openAiFeedJsonl,
  openAiFeedRow,
  productFeedItems,
  robotsTxt,
  truncateText,
  validGtin,
  verificationTokens,
  type FeedOptions,
} from './merchant.js'
import type { Product, ProductVariant } from './types.js'

const money = (amount: string, currency_code = 'MXN') => ({ amount, currency_code })

function variant(over: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: 'v1',
    sku: 'UD2510003',
    title: 'Default Title',
    selected_options: [],
    price: money('494.71'),
    compare_at_price: null,
    available_for_sale: true,
    quantity_available: null,
    availability: { status: 'in_stock', quantity: null, max_per_order: null, restock_eta: null, preorder_release_at: null, notify_available: false },
    image: null,
    barcode: null,
    ...over,
  }
}

function product(over: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    handle: 'rotula-izq-4x2-toyota-tacoma-2-4-l4-1995-2004-ud2510003',
    title: 'ROTULA IZQ 4X2 TOYOTA TACOMA 2.4 L4 1995 2004',
    description: 'Rótula inferior izquierda Unicar, referencia UD2510003.',
    description_html: '<p>Rótula inferior izquierda Unicar, referencia UD2510003.</p>',
    vendor: 'UNICAR',
    product_type: null,
    category: { id: 'c1', handle: 'suspension', title: 'Suspensión y dirección' },
    tags: [],
    attributes: {
      pieza: 'ROTULA', position: 'izquierda', traccion: '4X2', motor: '2.4 L4', anio_desde: 1995, anio_hasta: 2004,
      part_number: 'UD2510003', vehiculo_marca: 'Toyota', vehiculo_modelo: 'TACOMA',
    },
    featured_image: { url: '/storage/catalog/ud2510003.webp', alt: null },
    images: [{ url: '/storage/catalog/ud2510003.webp', alt: null }, { url: '/storage/catalog/ud2510003-b.jpg', alt: null }],
    options: [],
    variants: [variant()],
    price_range: { min: money('494.71'), max: money('494.71') },
    compare_at_price_range: null,
    available_for_sale: true,
    seo: { title: null, description: null },
    updated_at: '2026-11-01T00:00:00Z',
    ...over,
  }
}

const options: FeedOptions = { siteUrl: 'https://protekauto.com.mx', productPath: (h) => `/productos/${h}` }

describe('productFeedItems', () => {
  it('maps a part to a complete item (title, brand + mpn → identifiers exist without GTIN, absolute images)', () => {
    const { items, skipped } = productFeedItems(product(), options)
    expect(skipped).toEqual([])
    expect(items).toEqual([
      {
        id: 'UD2510003',
        variant_id: 'v1',
        group_id: null,
        title: 'Rótula izquierda 4x2 Unicar UD2510003 para Toyota Tacoma 2.4 L4 1995–2004',
        description: 'Rótula inferior izquierda Unicar, referencia UD2510003.',
        link: 'https://protekauto.com.mx/productos/rotula-izq-4x2-toyota-tacoma-2-4-l4-1995-2004-ud2510003',
        image_link: 'https://protekauto.com.mx/storage/catalog/ud2510003.webp',
        additional_image_links: ['https://protekauto.com.mx/storage/catalog/ud2510003-b.jpg'],
        availability: 'in_stock',
        availability_date: null,
        price: money('494.71'),
        sale_price: null,
        brand: 'UNICAR',
        mpn: 'UD2510003',
        gtin: null,
        identifier_exists: true,
        condition: 'new',
        product_type: 'Suspensión y dirección',
        variant_options: {},
      },
    ])
  })

  it('a valid barcode becomes the GTIN', () => {
    const [item] = productFeedItems(product({ variants: [variant({ barcode: '7501031311309' })] }), options).items
    expect(item!.gtin).toBe('7501031311309')
    expect(item!.identifier_exists).toBe(true)
  })

  it('skips internal products (qa tag, TEST- SKUs), no price, no image and — by default — out of stock', () => {
    expect(productFeedItems(product({ tags: ['QA'] }), options).skipped).toEqual(['hidden'])
    expect(productFeedItems(product({ variants: [variant({ sku: 'TEST-PAY-5' })] }), options).skipped).toEqual(['hidden'])
    expect(productFeedItems(product({ tags: ['Interno'] }), options).skipped).toEqual(['hidden'])
    // A TEST- SKU next to a real one is not internal.
    expect(productFeedItems(product({ variants: [variant({ sku: 'TEST-1' }), variant({ id: 'v2', sku: 'UD1' })] }), options).items).toHaveLength(2)
    expect(productFeedItems(product({ variants: [variant({ price: money('0') })] }), options).skipped).toEqual(['no_price'])
    expect(productFeedItems(product({ images: [], featured_image: null }), options).skipped).toEqual(['no_image'])
    expect(productFeedItems(product({ images: [{ url: '/mock/part.svg', alt: null }], featured_image: null }), options).skipped).toEqual(['no_image'])
    expect(productFeedItems(product({ vendor: null }), options).skipped).toEqual(['no_brand'])
    const out = variant({ available_for_sale: false, availability: { status: 'out_of_stock', quantity: null, max_per_order: null, restock_eta: null, preorder_release_at: null, notify_available: false } })
    expect(productFeedItems(product({ variants: [out] }), options).skipped).toEqual(['out_of_stock'])
    expect(productFeedItems(product({ variants: [out] }), { ...options, includeOutOfStock: true }).items[0]!.availability).toBe('out_of_stock')
  })

  it('brandFallback fills a missing vendor', () => {
    expect(productFeedItems(product({ vendor: null }), { ...options, brandFallback: 'ProtekAuto' }).items[0]!.brand).toBe('ProtekAuto')
  })

  it('an offer goes as price = compare-at and sale_price = selling price', () => {
    const [item] = productFeedItems(product({ variants: [variant({ compare_at_price: money('600.00') })] }), options).items
    expect(item!.price).toEqual(money('600.00'))
    expect(item!.sale_price).toEqual(money('494.71'))
  })

  it('backorder and preorder keep their date', () => {
    const v = variant({ availability: { status: 'preorder', quantity: null, max_per_order: null, restock_eta: null, preorder_release_at: '2026-12-01T00:00:00Z', notify_available: false } })
    const [item] = productFeedItems(product({ variants: [v] }), options).items
    expect(item!.availability).toBe('preorder')
    expect(item!.availability_date).toBe('2026-12-01T00:00:00Z')
  })

  it('variants: one item each, grouped, with the option in the title and no MPN guessed from the SKU', () => {
    const p = product({
      title: 'Proteína Whey 2 lb',
      vendor: 'Optimum',
      attributes: {},
      variants: [
        variant({ id: 'a', sku: 'WHEY-CH', title: 'Chocolate', selected_options: [{ name: 'Sabor', value: 'Chocolate' }] }),
        variant({ id: 'b', sku: 'WHEY-VA', title: 'Vainilla', selected_options: [{ name: 'Sabor', value: 'Vainilla' }] }),
      ],
    })
    const { items } = productFeedItems(p, options)
    expect(items.map((i) => [i.id, i.group_id, i.title, i.mpn, i.variant_options, i.link])).toEqual([
      ['WHEY-CH', 'p1', 'Proteína Whey 2 lb Optimum - Chocolate', null, { Sabor: 'Chocolate' }, `${options.siteUrl}/productos/${p.handle}?variant=a`],
      ['WHEY-VA', 'p1', 'Proteína Whey 2 lb Optimum - Vainilla', null, { Sabor: 'Vainilla' }, `${options.siteUrl}/productos/${p.handle}?variant=b`],
    ])
  })

  it('a productPath that takes the variant decides the variant URL', () => {
    const p = product({ variants: [variant({ id: 'a', sku: 'A' }), variant({ id: 'b', sku: 'B' })] })
    const links = productFeedItems(p, { ...options, productPath: (h, v) => `/productos/${h}${v ? `?variante=${v}` : ''}` }).items.map((i) => i.link)
    expect(links).toEqual([`${options.siteUrl}/productos/${p.handle}?variante=a`, `${options.siteUrl}/productos/${p.handle}?variante=b`])
  })

  it('title and description are capped (150 / 5000) at a word boundary', () => {
    const [item] = productFeedItems(product({ description: 'palabra '.repeat(1000) }), { ...options, title: () => 'pieza '.repeat(40) }).items
    expect(item!.title.length).toBeLessThanOrEqual(150)
    expect(item!.title.endsWith('…')).toBe(true)
    expect(item!.description.length).toBeLessThanOrEqual(5000)
  })

  it('description falls back to the HTML (tags stripped) and then to the title', () => {
    expect(productFeedItems(product({ description: '', description_html: '<p>Hola &amp; adiós</p>' }), options).items[0]!.description).toBe('Hola & adiós')
    expect(productFeedItems(product({ description: '', description_html: '' }), options).items[0]!.description).toContain('Rótula izquierda')
  })
})

describe('review cases', () => {
  const pre = (date: string | null) => variant({ availability: { status: 'preorder', quantity: null, max_per_order: null, restock_eta: null, preorder_release_at: date, notify_available: false } })
  it('a preorder without a release date is skipped (Google requires the date; never invented)', () => {
    expect(productFeedItems(product({ variants: [pre(null)] }), options).skipped).toEqual(['no_date'])
  })
  it('a price that is not a plain decimal is skipped, not rounded', () => {
    expect(productFeedItems(product({ variants: [variant({ price: money('1.005') })] }), options).skipped).toEqual(['no_price'])
  })
  it('without GTIN and without MPN: identifier_exists=false; with brand + MPN: true', () => {
    expect(productFeedItems(product({ attributes: {} }), options).items[0]!.identifier_exists).toBe(false)
    expect(productFeedItems(product(), options).items[0]!.identifier_exists).toBe(true)
  })
  it('an invalid productPath skips the item instead of breaking the feed', () => {
    expect(productFeedItems(product(), { ...options, productPath: () => 'javascript:alert(1)' }).skipped).toEqual(['no_link'])
    const multi = product({ variants: [variant({ id: 'a', sku: 'A' }), variant({ id: 'b', sku: 'B' })] })
    expect(productFeedItems(multi, { ...options, productPath: () => 'javascript:x' }).skipped).toEqual(['no_link', 'no_link'])
  })
  it('the plain description keeps `<` and `&`; only description_html loses tags, entities decoded once', () => {
    expect(productFeedItems(product({ description: 'Medida <10 mm> & más' }), options).items[0]!.description).toBe('Medida <10 mm> & más')
    expect(productFeedItems(product({ description: '', description_html: '<p>a &amp;lt; b</p>' }), options).items[0]!.description).toBe('a &lt; b')
  })
  it('OpenAI: no empty variant_dict', () => {
    const multi = product({ variants: [variant({ id: 'a', sku: 'A' }), variant({ id: 'b', sku: 'B' })] })
    const row = openAiFeedRow(productFeedItems(multi, options).items[0]!, { name: 'S' })
    expect(row.group_id).toBe('p1')
    expect(row).not.toHaveProperty('variant_dict')
    expect(row).not.toHaveProperty('listing_has_variations')
  })
  it('a repeated OPS id is counted, not dropped silently', async () => {
    const out = await collectFeed(async () => ({ nodes: [product(), product()], page_info: { has_next_page: false, end_cursor: null } }), options)
    expect(out.items).toHaveLength(1)
    expect(out.skipped.duplicate_id).toBe(1)
  })
})

describe('collectFeed', () => {
  it('walks every page, counts what it skipped and never repeats an id', async () => {
    const pages = [
      { nodes: [product(), product({ id: 'p2', tags: ['interno'] })], page_info: { has_next_page: true, end_cursor: 'c1' } },
      { nodes: [product({ id: 'p3', variants: [variant({ id: 'v3' })] }), product({ id: 'p4', variants: [variant({ id: 'v4', sku: 'X1', price: money('0') })] })], page_info: { has_next_page: false, end_cursor: null } },
    ]
    const calls: (string | undefined)[] = []
    const out = await collectFeed(async (after) => {
      calls.push(after)
      return pages[after ? 1 : 0]!
    }, options)
    expect(calls).toEqual([undefined, 'c1'])
    expect(out.products).toBe(4)
    // p1 and p3 share the SKU UD2510003: both go with their OPS id, whatever the order of the walk.
    expect(out.items.map((i) => i.id)).toEqual(['v1', 'v3'])
    expect(out.skipped).toEqual({ hidden: 1, no_price: 1, no_image: 0, out_of_stock: 0, no_brand: 0, no_date: 0, no_link: 0, duplicate_id: 0 })
    expect(out.truncated).toBe(false)
  })

  it('stops at maxProducts', async () => {
    const out = await collectFeed(async () => ({ nodes: [product(), product({ id: 'p2', variants: [variant({ id: 'v2', sku: 'B' })] })], page_info: { has_next_page: true, end_cursor: 'x' } }), { ...options, maxProducts: 1 })
    expect(out.products).toBe(1)
    expect(out.truncated).toBe(true)
  })
})

describe('writers', () => {
  const [item] = productFeedItems(product(), options).items

  it('feedPrice: the OPS string with the currency decimals, never through a float', () => {
    expect(feedPrice(money('494.7'))).toBe('494.70 MXN')
    expect(feedPrice(money('1200', 'usd'))).toBe('1200.00 USD')
    expect(feedPrice(money('1500', 'JPY'))).toBe('1500 JPY')
    expect(feedPrice(money('0.10'))).toBe('0.10 MXN')
    expect(feedAmount(money('1.005'))).toBeNull()
    expect(feedAmount(money('1e3'))).toBeNull()
    expect(feedAmount(money('1,200.00'))).toBeNull()
  })

  it('Google XML: RSS 2.0, g: namespace, escaped, identifier_exists=no without GTIN and MPN', () => {
    const body = googleFeedXml([{ ...item!, title: 'A & B <c>', identifier_exists: false }], { title: 'ProtekAuto', link: 'https://protekauto.com.mx' })
    expect(body).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">')
    expect(body).toContain('<g:title>A &amp; B &lt;c&gt;</g:title>')
    expect(body).toContain('<g:price>494.71 MXN</g:price>')
    expect(body).toContain('<g:brand>UNICAR</g:brand>')
    expect(body).toContain('<g:mpn>UD2510003</g:mpn>')
    expect(body).toContain('<g:identifier_exists>no</g:identifier_exists>')
    expect(body).toContain('<g:condition>new</g:condition>')
    expect(body).toContain('<g:availability>in_stock</g:availability>')
    expect(body).not.toContain('<g:gtin>')
  })

  it('Google XML with no items is still valid', () => {
    expect(googleFeedXml([], { title: 'T', link: 'https://x.mx' })).toMatch(/<channel>\n<title>T<\/title>[\s\S]*<\/channel>\n<\/rss>\n$/)
  })

  it('Google TSV: header + one row, tabs and newlines in values flattened', () => {
    const tsv = googleFeedTsv([{ ...item!, description: 'a\tb\nc', identifier_exists: false }])
    const [header, row] = tsv.trim().split('\n')
    expect(header!.split('\t')).toContain('identifier_exists')
    const cells = Object.fromEntries(header!.split('\t').map((h, i) => [h, row!.split('\t')[i]]))
    expect(cells.description).toBe('a b c')
    expect(cells.identifier_exists).toBe('no')
    expect(cells.price).toBe('494.71 MXN')
  })

  it('OpenAI row: the required fields of the Product Feed Spec', () => {
    const row = openAiFeedRow(item!, { name: 'ProtekAuto', url: 'https://protekauto.com.mx', return_days: 30, return_policy_url: 'https://protekauto.com.mx/paginas/devoluciones' })
    for (const k of ['item_id', 'title', 'description', 'url', 'brand', 'seller_name', 'image_url', 'availability', 'price']) expect(row[k], k).toBeTruthy()
    expect(row).toMatchObject({ item_id: 'UD2510003', price: '494.71 MXN', availability: 'in_stock', mpn: 'UD2510003', accepts_returns: true, return_deadline_in_days: 30, is_eligible_search: true })
    expect(row).not.toHaveProperty('is_eligible_checkout')
    expect(row).not.toHaveProperty('seller_tos')
  })

  it('OpenAI: preorder is `pre_order`; unknown return window sends no returns fields', () => {
    const row = openAiFeedRow({ ...item!, availability: 'preorder' }, { name: 'S', return_days: null })
    expect(row.availability).toBe('pre_order')
    expect(row).not.toHaveProperty('accepts_returns')
  })

  it('OpenAI JSONL: one JSON object per line', () => {
    const body = openAiFeedJsonl([item!, item!], { name: 'ProtekAuto' })
    expect(body.trim().split('\n').map((l) => JSON.parse(l).item_id)).toEqual(['UD2510003', 'UD2510003'])
    expect(openAiFeedJsonl([], { name: 'x' })).toBe('')
  })
})

describe('helpers', () => {
  it('validGtin checks length and check digit', () => {
    expect(validGtin('7501031311309')).toBe('7501031311309')
    expect(validGtin('7501031311308')).toBeNull()
    expect(validGtin('UD2510003')).toBeNull()
    expect(validGtin('')).toBeNull()
    expect(validGtin('036000291452')).toBe('036000291452')
  })

  it('truncateText', () => {
    expect(truncateText('corto', 10)).toBe('corto')
    expect(truncateText('una frase bastante larga', 12)).toBe('una frase…')
  })
})

describe('robotsTxt', () => {
  it('names the search agents with the shared rules and blocks the training crawlers', () => {
    const body = robotsTxt({ disallow: ['/carrito', '/pagar'], sitemaps: ['https://protekauto.com.mx/sitemap.xml'] })
    expect(body).toBe(
      [
        'User-agent: Googlebot',
        'User-agent: Storebot-Google',
        'User-agent: Googlebot-Image',
        'User-agent: Bingbot',
        'User-agent: Applebot',
        'User-agent: OAI-SearchBot',
        'User-agent: PerplexityBot',
        'User-agent: Claude-SearchBot',
        'User-agent: DuckAssistBot',
        'User-agent: ChatGPT-User',
        'User-agent: Perplexity-User',
        'User-agent: Claude-User',
        'User-agent: *',
        'Allow: /',
        'Disallow: /carrito',
        'Disallow: /pagar',
        '',
        'User-agent: GPTBot',
        'User-agent: Google-Extended',
        'User-agent: CCBot',
        'User-agent: ClaudeBot',
        'User-agent: anthropic-ai',
        'User-agent: Applebot-Extended',
        'User-agent: Bytespider',
        'User-agent: meta-externalagent',
        'Disallow: /',
        '',
        'Sitemap: https://protekauto.com.mx/sitemap.xml',
        '',
      ].join('\n'),
    )
  })

  it('an agent both allowed and blocked stays allowed; blockAgents [] blocks none', () => {
    const body = robotsTxt({ allowAgents: ['GPTBot'], blockAgents: ['GPTBot', 'CCBot'] })
    expect(body).toContain('User-agent: GPTBot\nUser-agent: *\nAllow: /')
    expect(body).toContain('User-agent: CCBot\nDisallow: /')
    expect(body.match(/GPTBot/g)).toHaveLength(1)
    expect(robotsTxt({ blockAgents: [] })).not.toContain('Disallow: /\n')
  })
})

describe('verificationTokens', () => {
  it('keeps only well-formed tokens', () => {
    expect(verificationTokens('abcDEF123_-xyz, otro-token-valido "><script>')).toEqual(['abcDEF123_-xyz', 'otro-token-valido'])
    expect(verificationTokens(undefined)).toEqual([])
    expect(verificationTokens('corto')).toEqual([])
  })
})
