import { describe, expect, it } from 'vitest'
import type { Product } from '@asteby/storefront'
import { productJsonLd } from './seo.js'

const PAGE = 'https://protekauto.com.mx/productos/rotula'
const money = (amount: string) => ({ amount, currency_code: 'MXN' })
const variant = (id: string, sku: string) => ({ id, title: 'Default Title', sku, barcode: null, price: money('494.71'), compare_at_price: null, available_for_sale: true, quantity_available: null, selected_options: [], image: null })
const product = (over: Partial<Product> = {}): Product =>
  ({
    id: 'p1', handle: 'rotula', title: 'ROTULA IZQ 4X2 TOYOTA TACOMA 2.4 L4 1995 2004', description: 'Rótula', vendor: 'UNICAR', product_type: null, category: null, tags: [],
    attributes: { part_number: 'UD2510003' }, featured_image: null, images: [], variants: [variant('v1', 'UD2510003')],
    price_range: { min: money('494.71'), max: money('494.71') }, compare_at_price_range: null, available_for_sale: true, seo: { title: null, description: null }, options: [],
    description_html: '', updated_at: '2026-11-01T00:00:00Z',
    ...over,
  }) as Product
const shop = { name: 'ProtekAuto', domain: 'protekauto.com.mx' }

describe('productJsonLd: name, mpn, return policy, shipping', () => {
  it('without options it is what it always was (no mpn, no policy, no rating)', () => {
    const ld = productJsonLd(product(), shop, PAGE)
    expect(ld.name).toBe('ROTULA IZQ 4X2 TOYOTA TACOMA 2.4 L4 1995 2004')
    expect(ld).not.toHaveProperty('mpn')
    expect(ld).not.toHaveProperty('aggregateRating')
    const offer = ld.offers as Record<string, unknown>
    expect(offer).not.toHaveProperty('hasMerchantReturnPolicy')
    expect(offer).not.toHaveProperty('shippingDetails')
    expect(offer).not.toHaveProperty('priceValidUntil')
  })

  it('name and mpn as the feed sends them; brand and sku from OPS', () => {
    const ld = productJsonLd(product(), shop, PAGE, { name: 'Rótula izquierda 4x2 Unicar UD2510003 para Toyota Tacoma 2.4 L4 1995–2004', mpn: 'UD2510003' })
    expect(ld).toMatchObject({ name: 'Rótula izquierda 4x2 Unicar UD2510003 para Toyota Tacoma 2.4 L4 1995–2004', mpn: 'UD2510003', sku: 'UD2510003', brand: { '@type': 'Brand', name: 'UNICAR' } })
    expect(ld.offers).toMatchObject({ mpn: 'UD2510003', sku: 'UD2510003', itemCondition: 'https://schema.org/NewCondition', availability: 'https://schema.org/InStock', price: '494.71', priceCurrency: 'MXN' })
  })

  it('mpn stays off the offers of a multi-variant product', () => {
    const ld = productJsonLd(product({ variants: [variant('a', 'A'), variant('b', 'B')] }), shop, PAGE, { mpn: 'X' })
    for (const o of ld.offers as Record<string, unknown>[]) expect(o).not.toHaveProperty('mpn')
  })

  it('hasMerchantReturnPolicy from a real policy (finite window / not permitted)', () => {
    const offer = productJsonLd(product(), shop, PAGE, { returnPolicy: { applicableCountry: 'MX', days: 30, url: 'https://protekauto.com.mx/paginas/devoluciones', method: 'ReturnByMail' } }).offers as Record<string, unknown>
    expect(offer.hasMerchantReturnPolicy).toEqual({
      '@type': 'MerchantReturnPolicy',
      applicableCountry: 'MX',
      returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
      merchantReturnDays: 30,
      returnMethod: 'https://schema.org/ReturnByMail',
      merchantReturnLink: 'https://protekauto.com.mx/paginas/devoluciones',
    })
    const none = productJsonLd(product(), shop, PAGE, { returnPolicy: { applicableCountry: 'MX', days: 0 } }).offers as Record<string, unknown>
    expect(none.hasMerchantReturnPolicy).toEqual({ '@type': 'MerchantReturnPolicy', applicableCountry: 'MX', returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted' })
  })

  it('shippingDetails and priceValidUntil only when given', () => {
    const offer = productJsonLd(product(), shop, PAGE, { priceValidUntil: '2026-12-31', shipping: { country: 'MX', rate: money('199.00'), handlingDays: [0, 1], transitDays: [1, 3] } }).offers as Record<string, unknown>
    expect(offer.priceValidUntil).toBe('2026-12-31')
    expect(offer.shippingDetails).toEqual({
      '@type': 'OfferShippingDetails',
      shippingRate: { '@type': 'MonetaryAmount', value: '199.00', currency: 'MXN' },
      shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'MX' },
      deliveryTime: {
        '@type': 'ShippingDeliveryTime',
        handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 1, unitCode: 'DAY' },
        transitTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 3, unitCode: 'DAY' },
      },
    })
  })
})
