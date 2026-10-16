import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createStorefrontClient, type Product, type Shop } from '@asteby/storefront'
import { createMockStorefront } from '@asteby/storefront/mock'
import {
  CartProvider,
  Image,
  JsonLd,
  Money,
  ProductPrice,
  Sections,
  StorefrontProvider,
  ThemeStyle,
  VariantSelector,
  breadcrumbJsonLd,
  collectionJsonLd,
  createSectionRegistry,
  defineSection,
  faqJsonLd,
  getCartIdFromCookie,
  localBusinessJsonLd,
  organizationJsonLd,
  productJsonLd,
  productMeta,
  resolveSectionProps,
  sectionJsonSchema,
  serializeCartCookie,
  serializeJsonLd,
  themeToCss,
  useCart,
  useStorefront,
} from './index.js'

const mock = createMockStorefront()
const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
const shop = (await sf.shop.get()) as Shop
const playera = (await sf.products.get('playera-basica')) as Product
const llanta = (await sf.products.get('llanta-205-55-r16-touring')) as Product

describe('SSR safety', () => {
  it('runs without window/document', () => {
    expect(typeof window).toBe('undefined')
    expect(typeof document).toBe('undefined')
  })

  it('renders providers with an initial cart on the server', async () => {
    const cart = await sf.carts.create({ lines: [{ variant_id: playera.variants[0]!.id, quantity: 2 }] })
    function Count() {
      const { totalQuantity, status } = useCart()
      const { locale, currency } = useStorefront()
      return <span>{`${totalQuantity}|${status}|${locale}|${currency}`}</span>
    }
    const html = renderToString(
      <StorefrontProvider config={{ baseUrl: 'https://mock.local/api/gw', token: 'pk_x', fetch: mock.fetch }} shop={shop}>
        <CartProvider initialCart={cart}>
          <Count />
        </CartProvider>
      </StorefrontProvider>,
    )
    expect(html).toContain('2|idle|es-MX|MXN')
  })
})

describe('components', () => {
  it('<Money> formats with the provider locale', () => {
    const html = renderToString(
      <StorefrontProvider shop={shop}>
        <Money data={{ amount: '1899.00', currency_code: 'MXN' }} className="price" />
      </StorefrontProvider>,
    )
    expect(html).toBe('<span class="price">$1,899.00</span>')
    expect(renderToString(<Money data={{ amount: '5', currency_code: 'USD' }} locale="en-US" withoutTrailingZeros as="b" />)).toBe('<b>$5</b>')
  })

  it('<Image> builds a capped srcset and is lazy unless priority', () => {
    const html = renderToString(<Image data={{ url: 'https://cdn.example/a.jpg', alt: 'A', width: 800, height: 400 }} sizes="50vw" />)
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('srcSet="https://cdn.example/a.jpg?width=320&amp;height=160 320w')
    expect(html).toContain('768w')
    expect(html).not.toContain('1024w')
    expect(html).toContain('sizes="50vw"')
    expect(html).toContain('width="800"')
    expect(html).toContain('height="400"')
    const eager = renderToString(<Image data={{ url: '/img/b.jpg', alt: null }} priority widths={[100, 200]} />)
    expect(eager).toContain('loading="eager"')
    expect(eager).toContain('fetchPriority="high"')
    expect(eager).toContain('/img/b.jpg?width=200 200w')
    expect(eager).toContain('alt=""')
  })

  it('<ProductPrice> shows compare-at and ranges', () => {
    const variantHtml = renderToString(<ProductPrice variant={playera.variants[0]!} locale="es-MX" />)
    expect(variantHtml).toContain('$249.00')
    expect(variantHtml).toContain('<s data-compare-at-price="">')
    expect(variantHtml).toContain('$299.00')
    const sudadera = { price_range: { min: { amount: '699.00', currency_code: 'MXN' }, max: { amount: '749.00', currency_code: 'MXN' } }, compare_at_price_range: null }
    const rangeHtml = renderToString(<ProductPrice product={sudadera} locale="es-MX" />)
    expect(rangeHtml).toContain('Desde')
    expect(rangeHtml).not.toContain('<s ')
  })

  it('<VariantSelector> reads the selection from search params', () => {
    const html = renderToString(
      <VariantSelector product={playera} searchParams="?Talla=L&Color=Negro&page=2">
        {({ option, selectedVariant }) => (
          <fieldset data-option={option.name} data-variant={selectedVariant?.id}>
            {option.values.map((v) => (
              <a key={v.value} href={v.search} data-selected={v.selected} data-available={v.available}>
                {v.value}
              </a>
            ))}
          </fieldset>
        )}
      </VariantSelector>,
    )
    // L / Negro is the out-of-stock variant (index 5).
    expect(html).toContain(`data-variant="${playera.variants[5]!.id}"`)
    expect(html).toContain('href="?Talla=M&amp;Color=Negro&amp;page=2"')
    expect(html).toMatch(/data-selected="true" data-available="false">Negro/)
    expect(html).toMatch(/data-selected="false" data-available="true">Blanco/)
  })
})

describe('cookie helpers', () => {
  it('reads and writes the cart cookie', () => {
    expect(getCartIdFromCookie('a=1; sf_cart=cart_123; b=2')).toBe('cart_123')
    expect(getCartIdFromCookie('my_cart=x', 'my_cart')).toBe('x')
    expect(getCartIdFromCookie(null)).toBeNull()
    expect(getCartIdFromCookie('other=1')).toBeNull()
    expect(serializeCartCookie('c/1')).toBe('sf_cart=c%2F1; Path=/; Max-Age=2592000; SameSite=Lax')
    expect(serializeCartCookie(null, { secure: true })).toBe('sf_cart=; Path=/; Max-Age=0; SameSite=Lax; Secure')
  })
})

describe('seo', () => {
  it('builds product meta and JSON-LD', () => {
    const meta = productMeta(playera, shop, 'https://mi-tienda.example/products/playera-basica')
    expect(meta).toContainEqual({ title: 'Playera básica | Mi tienda' })
    expect(meta).toContainEqual({ tagName: 'link', rel: 'canonical', href: 'https://mi-tienda.example/products/playera-basica' })
    expect(meta).toContainEqual({ property: 'og:type', content: 'product' })

    const ld = productJsonLd(playera, shop, 'https://mi-tienda.example/products/playera-basica')
    expect(ld['@type']).toBe('Product')
    const offers = ld.offers as { availability: string; url: string; price: string }[]
    expect(offers).toHaveLength(6)
    expect(offers[5]!.availability).toBe('https://schema.org/OutOfStock')
    expect(offers[0]!.url).toContain('variant=')
    expect(offers[0]!.price).toBe('249.00')

    const tire = productJsonLd(llanta, shop, 'https://mi-tienda.example/products/x')
    expect(tire.additionalProperty).toContainEqual({ '@type': 'PropertyValue', name: 'rim', value: 16 })
    expect((tire.offers as { url: string }).url).toBe('https://mi-tienda.example/products/x')
  })

  it('builds organization, local business, breadcrumb, faq and collection JSON-LD', () => {
    expect(organizationJsonLd(shop)).toMatchObject({ '@type': 'Organization', name: 'Mi tienda', url: 'https://mi-tienda.example' })
    const branches = localBusinessJsonLd(shop, { type: 'ClothingStore' })
    expect(branches).toHaveLength(2)
    expect(branches[0]).toMatchObject({ '@type': 'ClothingStore', geo: { latitude: 19.4326 }, openingHours: ['Mo-Fr 09:00-19:00', 'Sa 09:00-14:00'] })
    expect(branches[1]!.telephone).toBe(shop.contact.phone)
    expect(breadcrumbJsonLd([{ name: 'Inicio', url: 'https://x/' }, { name: 'Ropa', url: 'https://x/c' }]).itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: 'https://x/' },
      { '@type': 'ListItem', position: 2, name: 'Ropa', item: 'https://x/c' },
    ])
    expect(faqJsonLd([{ question: 'Q?', answer: 'A' }]).mainEntity).toEqual([{ '@type': 'Question', name: 'Q?', acceptedAnswer: { '@type': 'Answer', text: 'A' } }])
    const col = collectionJsonLd({ id: 'c', handle: 'ropa', title: 'Ropa', description: '', image: null, seo: { title: null, description: null }, parent_handle: null }, [playera], 'https://x.example/collections/ropa')
    expect(col).toMatchObject({ '@type': 'CollectionPage', mainEntity: { numberOfItems: 1 } })
    expect(JSON.stringify(col)).toContain('https://x.example/products/playera-basica')
  })

  it('<JsonLd> escapes markup', () => {
    const html = renderToString(<JsonLd data={{ '@type': 'Thing', name: '</script><script>alert(1)</script> & co' }} />)
    expect(html).not.toContain('</script><script>')
    expect(html).toContain('\\u003c/script\\u003e')
    expect(html).toContain('\\u0026 co')
    expect(JSON.parse(serializeJsonLd({ a: '<b>' }))).toEqual({ a: '<b>' })
  })
})

describe('sections', () => {
  const hero = defineSection({
    type: 'hero',
    label: 'Hero',
    schema: {
      title: { label: 'Título', kind: 'text', required: true },
      subtitle: { label: 'Subtítulo', kind: 'text', default: 'Bienvenido' },
      align: { label: 'Alineación', kind: 'select', options: [{ value: 'left', label: 'Izq' }, { value: 'center', label: 'Centro' }], default: 'center' },
    },
    component: ({ title, subtitle, align, section }) => (
      <section id={section.id} data-align={align}>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </section>
    ),
  })
  const faq = defineSection({
    type: 'faq',
    schema: {
      items: { label: 'Preguntas', kind: 'list', default: [], items: { question: { label: 'Pregunta', kind: 'text', required: true }, answer: { label: 'Respuesta', kind: 'richtext', default: '' } } },
      limit: { label: 'Máximo', kind: 'number', min: 1, max: 20, default: 5 },
    },
    component: ({ items, limit }) => (
      <dl data-limit={limit}>
        {items.slice(0, limit).map((i) => (
          <dt key={i.question}>{i.question}</dt>
        ))}
      </dl>
    ),
  })
  const registry = createSectionRegistry([hero, faq])

  it('renders known sections with defaults and skips unknown/invalid ones', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const html = renderToString(
      <Sections
        registry={registry}
        sections={[
          { id: 'h1', type: 'hero', props: { title: 'Hola', align: 'diagonal' } },
          { id: 'x1', type: 'carousel', props: {} },
          { id: 'h2', type: 'hero', props: { subtitle: 'sin título' } },
          { id: 'f1', type: 'faq', props: { items: [{ question: '¿A?' }, { question: '¿B?' }], limit: '1' } },
        ]}
      />,
    )
    expect(html).toContain('<section id="h1" data-align="center"><h1>Hola</h1><p>Bienvenido</p></section>')
    expect(html).not.toContain('h2')
    expect(html).toContain('<dl data-limit="1"><dt>¿A?</dt></dl>')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Unknown section type "carousel"'))
    warn.mockRestore()
  })

  it('validates props and exports JSON Schema', () => {
    const { props, errors } = resolveSectionProps(faq.schema, { items: [{ answer: 'x' }, 'bad'], limit: 50, extra: true })
    expect(props).toEqual({ items: [{ answer: 'x' }], limit: 5 })
    expect(errors.map((e) => e.prop)).toEqual(['items[0].question', 'items[1]', 'limit'])
    const schema = sectionJsonSchema(hero)
    expect(schema).toMatchObject({ title: 'Hero', type: 'object', required: ['title'], properties: { align: { enum: ['left', 'center'], default: 'center' } } })
    expect(Object.keys(registry.toJSONSchema())).toEqual(['hero', 'faq'])
  })
})

describe('theme', () => {
  it('turns theme tokens into CSS variables', async () => {
    const theme = await sf.content.theme()
    const css = themeToCss(theme)
    expect(css.startsWith(':root{')).toBe(true)
    expect(css).toContain('--color-primary:#0f766e')
    expect(css).toContain('--primary:#0f766e')
    expect(css).toContain('--color-primary-foreground:#ffffff')
    expect(css).toContain('--font-heading:"Inter", ui-sans-serif')
    expect(css).toContain('--radius:0.5rem')
  })

  it('normalizes names, filters unsafe values and renders <style>', () => {
    const css = themeToCss(
      { tokens: { primaryForeground: '#fff', evil: 'red;}</style><script>', bg: 'url(https://x)' }, fonts: { body: 'Work Sans' }, radius: '4px' },
      { naming: 'color', selector: '[data-theme]' },
    )
    expect(css).toBe('[data-theme]{--color-primary-foreground:#fff;--font-body:"Work Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;--radius:4px}')
    const html = renderToString(<ThemeStyle theme={{ tokens: { primary: 'oklch(0.5 0.1 175)' } }} naming="metacore" />)
    expect(html).toBe('<style id="storefront-theme" data-storefront-theme="">:root{--primary:oklch(0.5 0.1 175)}</style>')
    expect(renderToString(<ThemeStyle theme={null} />)).toBe('')
  })
})
