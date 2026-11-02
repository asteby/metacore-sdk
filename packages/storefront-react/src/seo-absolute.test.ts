import { describe, expect, it } from 'vitest'
import type { Collection, Product, Shop } from '@asteby/storefront'
import { collectionJsonLd, localBusinessJsonLd, organizationJsonLd, productJsonLd, seoMeta } from './seo.js'

const PAGE = 'https://tienda.example/productos/filtro'
const money = (amount: string) => ({ amount, currency_code: 'MXN' })
const product = (over: Partial<Product> = {}): Product =>
  ({
    id: 'p1', handle: 'filtro', title: 'Filtro', description: '', vendor: null, product_type: null, category: null, tags: [], attributes: {},
    featured_image: { url: '/storage/catalog/a.jpeg', alt: null, width: null, height: null },
    images: [
      { url: '/storage/catalog/a.jpeg', alt: null, width: null, height: null },
      { url: 'https://cdn.example/b.webp', alt: null, width: null, height: null },
    ],
    variants: [{ id: 'v1', title: 'Default Title', sku: 'F1', barcode: null, price: money('10.00'), compare_at_price: null, available_for_sale: true, quantity_available: 3, selected_options: [], image: null }],
    ...over,
  }) as unknown as Product
const shop = { name: 'Tienda', description: null, domain: 'tienda.example', logo: { url: '/brand/logo.png' }, contact: { email: null, phone: null, whatsapp: null }, branches: [{ id: 'b1', name: 'Centro', address: 'Av. 1', city: 'CDMX', phone: null, lat: 1, lng: 1, hours: null }] } as unknown as Shop

describe('URLs absolutas en JSON-LD y Open Graph (OPS sirve fotos como /storage/…)', () => {
  it('productJsonLd resuelve las imágenes relativas contra la URL de la página y deja intactas las absolutas', () => {
    expect(productJsonLd(product(), { name: 'Tienda', domain: 'tienda.example' }, PAGE).image).toEqual([
      'https://tienda.example/storage/catalog/a.jpeg',
      'https://cdn.example/b.webp',
    ])
  })

  it('og:image absoluta cuando hay URL canónica; sin URL se deja como venía', () => {
    const og = (m: ReturnType<typeof seoMeta>) => m.find((d) => 'property' in d && d.property === 'og:image') as { content: string }
    expect(og(seoMeta({ title: 't', url: PAGE, image: '/storage/x.jpg' })).content).toBe('https://tienda.example/storage/x.jpg')
    expect(og(seoMeta({ title: 't', image: '/storage/x.jpg' })).content).toBe('/storage/x.jpg')
  })

  it('logo de Organization y LocalBusiness absolutos', () => {
    expect(organizationJsonLd(shop).logo).toBe('https://tienda.example/brand/logo.png')
    expect(localBusinessJsonLd(shop)[0]!.image).toBe('https://tienda.example/brand/logo.png')
  })

  it('collectionJsonLd: imagen de la colección y de cada producto absolutas', () => {
    const c = { title: 'Filtros', description: '', seo: { title: null, description: null }, image: { url: '/storage/c.jpg' } } as unknown as Collection
    const ld = collectionJsonLd(c, [{ handle: 'filtro', title: 'Filtro', featured_image: { url: '/storage/p.jpg' } } as never], 'https://tienda.example/colecciones/filtros') as Record<string, any>
    expect(ld.image).toBe('https://tienda.example/storage/c.jpg')
    expect(ld.mainEntity.itemListElement[0].image).toBe('https://tienda.example/storage/p.jpg')
  })
})
