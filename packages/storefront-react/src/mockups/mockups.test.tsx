import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { gzipSync } from 'node:zlib'
import type { Product } from '@asteby/storefront'
import { createMockStorefront } from '@asteby/storefront/mock'
import { createStorefrontClient } from '@asteby/storefront'
import {
  BUILTIN_MOCKUPS,
  MockupFrame,
  MockupProvider,
  MockupText,
  ProductImage,
  ProductMockup,
  createMockupRegistry,
  defaultMockupRegistry,
  mockupDataFromProduct,
  registerMockup,
  wrapMockupText,
  type MockupComponentProps,
  type ProductImageProduct,
} from './index.js'

const tire: ProductImageProduct = {
  title: 'Llanta Touring',
  vendor: 'Marca Norte',
  product_type: 'Llanta',
  tags: [],
  attributes: { size_key: '205/55R16', section_width_mm: 205, aspect_ratio: 55, rim_diameter_in: 16, load_index: 91, speed_rating: 'V' },
  featured_image: null,
  images: [],
}
const part: ProductImageProduct = {
  title: 'Balatas delanteras cerámicas',
  vendor: 'Marca',
  tags: ['refacciones'],
  attributes: { part_number: 'BD-1234', oem_number: '04465-02220', fitment: 'Versa 2012–2019' },
  featured_image: null,
}
const supplement: ProductImageProduct = {
  title: 'Proteína de suero',
  vendor: 'Marca',
  product_type: 'Proteína',
  tags: [],
  attributes: { presentation: '2 lb' },
  options: [{ name: 'Sabor', values: ['Chocolate', 'Vainilla'] }],
  featured_image: null,
}
const plain: ProductImageProduct = { title: 'Paraguas compacto', vendor: 'Ruta Libre', product_type: 'Paraguas', tags: [], attributes: {}, featured_image: null }

const html = (el: React.ReactElement) => renderToString(el)
const textOf = (s: string) => s.replace(/<title>.*?<\/title>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

describe('ProductImage', () => {
  it('uses the real image from OPS when there is one', () => {
    const out = html(<ProductImage product={{ ...tire, featured_image: { url: 'https://cdn.example/x.jpg', alt: 'Llanta vista lateral', width: 800, height: 800 } }} priority sizes="50vw" className="h-full" />)
    expect(out).toContain('<img ')
    expect(out).toContain('alt="Llanta vista lateral"')
    expect(out).toContain('width="800"')
    expect(out).toContain('fetchPriority="high"')
    expect(out).toContain('loading="eager"')
    expect(out).not.toContain('<svg')
  })

  it('prefers the variant image and falls back to the title as alt', () => {
    const out = html(<ProductImage product={{ ...tire, featured_image: { url: '/a.jpg', alt: null } }} variant={{ image: { url: '/v.jpg', alt: null } }} />)
    expect(out).toContain('src="/v.jpg"')
    expect(out).toContain('alt="Llanta Touring"')
  })

  it('renders an accessible SVG mockup when there is no image', () => {
    const out = html(<ProductImage product={tire} className="h-full w-full" />)
    expect(out).toMatch(/^<svg /)
    expect(out).toContain('role="img"')
    expect(out).toContain('data-mockup="tire"')
    expect(out).toContain('data-mockup-fallback=""')
    expect(out).toContain('class="h-full w-full"')
    expect(out).toContain('aria-label="Ilustración de referencia: Llanta Touring, medida 205/55R16, 91V"')
    expect(out).toContain('<title>Ilustración de referencia: Llanta Touring, medida 205/55R16, 91V</title>')
    expect(out).not.toContain('<img')
    expect(out).not.toContain('<script')
  })

  it('alt="" makes the mockup decorative; a given alt is still announced as an illustration', () => {
    const hidden = html(<ProductImage product={plain} alt="" />)
    expect(hidden).toContain('aria-hidden="true"')
    expect(hidden).not.toContain('role="img"')
    expect(hidden).not.toContain('<title>')
    expect(html(<ProductImage product={plain} alt="Paraguas" />)).toContain('aria-label="Ilustración de referencia: Paraguas"')
  })

  it('image={null} forces the mockup; kind forces the kind', () => {
    const p = { ...plain, featured_image: { url: '/x.jpg', alt: null } }
    expect(html(<ProductImage product={p} image={null} />)).toContain('data-mockup="generic"')
    expect(html(<ProductImage product={plain} kind="supplement" />)).toContain('data-mockup="supplement"')
  })

  it('resolves the kind from product data', () => {
    expect(html(<ProductImage product={part} />)).toContain('data-mockup="part"')
    expect(html(<ProductImage product={supplement} />)).toContain('data-mockup="supplement"')
    expect(html(<ProductImage product={plain} />)).toContain('data-mockup="generic"')
  })

  it('a store resolveKind can override (prop or provider) and null keeps the default', () => {
    expect(html(<ProductImage product={plain} resolveKind={() => 'part'} />)).toContain('data-mockup="part"')
    expect(html(<ProductImage product={tire} resolveKind={() => null} />)).toContain('data-mockup="tire"')
    const out = html(
      <MockupProvider resolveKind={(p, d) => (p.product_type === 'Paraguas' ? 'supplement' : d)}>
        <ProductImage product={plain} />
        <ProductImage product={tire} />
      </MockupProvider>,
    )
    expect(out).toContain('data-mockup="supplement"')
    expect(out).toContain('data-mockup="tire"')
  })

  it('an unregistered kind falls back to generic', () => {
    expect(html(<ProductImage product={{ ...plain, attributes: { mockup_kind: 'helmet' } }} />)).toContain('data-mockup="generic"')
    expect(html(<ProductImage product={plain} kind="nope" />)).toContain('data-mockup="generic"')
  })
})

describe('mockup content: never invent, never prices', () => {
  it('tire shows size digits, brand and service only when present', () => {
    const full = textOf(html(<ProductImage product={tire} />))
    expect(full).toContain('205/55 R16')
    expect(full).toContain('Marca Norte')
    expect(full).toContain('91V')
    const bare = html(<ProductImage product={{ title: 'Llanta', product_type: 'Llanta', attributes: {} }} />)
    expect(bare).toContain('data-mockup="tire"')
    const t = textOf(bare)
    expect(t).toBe('Llanta')
    expect(t).not.toMatch(/\d/)
  })

  it('part shows part number, title and compatibility', () => {
    const t = textOf(html(<ProductImage product={part} />))
    expect(t).toContain('BD-1234')
    expect(t).toContain('Compatible con: Versa 2012–2019')
    expect(t).toContain('N.º de parte')
  })

  it('supplement shows flavor only once selected', () => {
    expect(textOf(html(<ProductImage product={supplement} />))).not.toContain('Chocolate')
    const t = textOf(html(<ProductImage product={supplement} variant={{ selected_options: [{ name: 'Sabor', value: 'Chocolate' }], image: null }} />))
    expect(t).toContain('Chocolate')
    expect(t).toContain('2 lb')
  })

  it('no mockup ever prints prices', async () => {
    const mock = createMockStorefront()
    const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
    const { nodes } = await sf.products.list({ first: 50 })
    for (const p of nodes as Product[]) {
      const out = html(<ProductImage product={p} image={null} />)
      expect(out).toMatch(/^<svg /)
      expect(out).not.toContain(p.price_range.min.amount)
      expect(out).not.toMatch(/\$|MXN/)
    }
  })
})

describe('escaping and limits', () => {
  const evil: ProductImageProduct = {
    title: '<script>alert(1)</script><img src=x onerror=alert(2)>',
    vendor: '"><svg onload=alert(3)>',
    product_type: 'Llanta',
    attributes: { size_key: '<b>205</b>', model: '&amp; </text><script>' },
  }

  it('escapes every product string in text and attributes', () => {
    for (const kind of ['tire', 'part', 'supplement', 'generic']) {
      const out = html(<ProductImage product={evil} kind={kind} />)
      expect(out).not.toMatch(/<script|<img|<svg onload|<b>|<\/text><script/)
      expect(out).toContain('&lt;script&gt;')
    }
  })

  it('caps long strings', () => {
    const long = { title: 'Palabra '.repeat(200), vendor: 'X'.repeat(300), attributes: {} }
    const out = html(<ProductImage product={long} />)
    expect(out.length).toBeLessThan(5000)
    expect(out).toContain('…')
  })

  it('wrapMockupText wraps, cuts long words and marks truncation', () => {
    expect(wrapMockupText('uno dos tres cuatro', 8, 3)).toEqual(['uno dos', 'tres', 'cuatro'])
    expect(wrapMockupText('uno dos tres cuatro', 8, 2)).toEqual(['uno dos', 'tres…'])
    expect(wrapMockupText('supercalifragilístico', 6, 1)).toEqual(['super…'])
    expect(wrapMockupText('', 6, 2)).toEqual([])
  })
})

describe('registry', () => {
  function Helmet({ data, label, labels: _l, ...rest }: MockupComponentProps<{ title: string; shell: string | null }>) {
    return (
      <MockupFrame kind="helmet" label={label} {...rest}>
        <MockupText lines={[data.shell ?? data.title]} x={200} y={200} size={20} />
      </MockupFrame>
    )
  }
  const helmet = {
    component: Helmet,
    fromProduct: (p: ProductImageProduct) => ({ title: p.title, shell: typeof p.attributes?.shell === 'string' ? p.attributes.shell : null }),
    describe: (d: { title: string }) => `Casco ilustrado: ${d.title}`,
  }

  it('isolated registry via provider, with custom kind resolver', () => {
    const registry = createMockupRegistry(BUILTIN_MOCKUPS).register('helmet', helmet)
    const out = html(
      <MockupProvider registry={registry} resolveKind={(p, d) => (p.product_type === 'Casco' ? 'helmet' : d)}>
        <ProductImage product={{ title: 'Casco X', product_type: 'Casco', attributes: { shell: 'Fibra' } }} />
      </MockupProvider>,
    )
    expect(out).toContain('data-mockup="helmet"')
    expect(out).toContain('aria-label="Casco ilustrado: Casco X"')
    expect(out).toContain('Fibra')
    expect(defaultMockupRegistry.has('helmet')).toBe(false)
  })

  it('mockup_kind attribute picks a registered custom kind', () => {
    const registry = defaultMockupRegistry.extend({ helmet })
    expect(html(<ProductImage registry={registry} product={{ title: 'C', attributes: { mockup_kind: 'helmet' } }} />)).toContain('data-mockup="helmet"')
  })

  it('registerMockup overrides a base kind in the default registry (component only keeps the base data)', () => {
    const original = defaultMockupRegistry.get('tire')!
    try {
      registerMockup('tire', ({ data, label, labels: _l, ...rest }: MockupComponentProps<{ size: string | null }>) => (
        <MockupFrame kind="my-tire" label={label} {...rest}>
          <MockupText lines={[data.size ?? '']} x={200} y={200} size={20} />
        </MockupFrame>
      ))
      const out = html(<ProductImage product={tire} />)
      expect(out).toContain('data-mockup="my-tire"')
      expect(out).toContain('205/55R16')
    } finally {
      registerMockup('tire', original)
    }
    expect(html(<ProductImage product={tire} />)).toContain('data-mockup="tire"')
  })

  it('rejects invalid kinds and renderers', () => {
    expect(() => createMockupRegistry().register('Bad Kind', Helmet)).toThrow(TypeError)
    expect(() => createMockupRegistry().register('ok', {} as never)).toThrow(TypeError)
  })

  it('empty registry renders nothing', () => {
    expect(html(<ProductImage product={plain} registry={createMockupRegistry()} />)).toBe('')
  })
})

describe('ProductMockup', () => {
  it('draws explicit kind + data, with label override and labels', () => {
    const data = mockupDataFromProduct('part', part)
    const out = html(<ProductMockup kind="part" data={data} labels={{ partNumber: 'Part no.', illustration: 'Illustration' }} width={200} height={200} />)
    expect(out).toContain('Part no.')
    expect(out).toContain('aria-label="Illustration: Balatas delanteras cerámicas, Part no. BD-1234"')
    expect(out).toContain('width="200"')
    expect(html(<ProductMockup kind="part" data={data} label="Balatas" />)).toContain('aria-label="Ilustración de referencia: Balatas"')
  })
})

describe('theming and weight', () => {
  it('paints only through CSS variables with neutral fallbacks (no hard-coded brand colors)', () => {
    const out = html(<ProductImage product={tire} />)
    expect(out).toContain('--mk-bg:var(--mockup-bg, var(--color-muted, light-dark(')
    expect(out).toContain('--mk-accent:var(--mockup-accent, var(--color-primary')
    const fills = [...out.matchAll(/(?:fill|stroke)="(#[0-9a-f]{3,8})"/gi)].map((m) => m[1])
    expect(fills).toEqual([])
  })

  it('each mockup stays small (< 2 KB gzip of SSR markup)', () => {
    const products = [tire, part, { ...supplement, attributes: { ...supplement.attributes, servings: 30 } }, plain]
    for (const p of products) {
      const out = html(<ProductImage product={p} />)
      expect(gzipSync(out).length).toBeLessThan(2048)
    }
  })

  it('wraps text in <tspan> only when multi-line and passes svg props', () => {
    const out = html(<MockupFrame label="x" kind="k" id="m1" style={{ color: 'red' }} />)
    expect(out).toContain('id="m1"')
    expect(out).toContain('color:red')
    expect(out).toContain('viewBox="0 0 400 400"')
    expect(out).toContain('focusable="false"')
  })
})
