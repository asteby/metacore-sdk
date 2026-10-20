import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { Availability, Product, ProductVariant } from '@asteby/storefront'
import { AvailabilityBadge, RestockNotifyForm, StockConflictAlert, VariantOptionState, productJsonLd, productMeta } from './index.js'

const av = (patch: Partial<Availability>): Availability => ({
  status: 'in_stock', quantity: null, max_per_order: null, restock_eta: null, preorder_release_at: null, notify_available: false, ...patch,
})

describe('availability without JavaScript (server render)', () => {
  it('renders full text with no provider', () => {
    const html = renderToString(
      <>
        <AvailabilityBadge availability={av({ status: 'low_stock', quantity: 2 })} />
        <VariantOptionState availability={av({ status: 'out_of_stock' })}>Chocolate</VariantOptionState>
        <RestockNotifyForm sku="S1" action="/avisame" availability={av({ status: 'out_of_stock', notify_available: true })} />
        <StockConflictAlert error={null} />
      </>,
    )
    expect(html).toContain('Quedan 2')
    expect(html).toContain('<s>Chocolate</s>')
    expect(html).toContain('method="post"')
    expect(html).toContain('action="/avisame"')
    expect(html).toContain('name="consent"')
  })
})

const variant = (patch: Partial<ProductVariant>): ProductVariant => ({
  id: 'v1', sku: 'SKU1', title: 'Fresa', selected_options: [], price: { amount: '100.00', currency_code: 'MXN' }, compare_at_price: null,
  available_for_sale: true, quantity_available: null, image: null, barcode: '750', ...patch,
})
const product = (variants: ProductVariant[]): Product =>
  ({
    id: 'p1', handle: 'whey', title: 'Whey', description: '', description_html: '', vendor: null, product_type: null, category: null, tags: [],
    attributes: {}, featured_image: null, images: [], options: [], variants, price_range: { min: variants[0]!.price, max: variants[0]!.price },
    compare_at_price_range: null, available_for_sale: variants.some((v) => v.available_for_sale), seo: { title: null, description: null }, updated_at: '',
  }) as Product

const offerOf = (p: Product, opts = {}) => {
  const ld = productJsonLd(p, null, 'https://t.example/products/whey', opts) as { offers: { availability: string; availabilityStarts?: string } | { availability: string }[] }
  return ld.offers
}

describe('schema.org availability in JSON-LD', () => {
  const server = (status: Availability['status'], extra: Partial<Availability> = {}) => variant({ availability: av({ status, ...extra }) })
  it.each([
    ['in_stock', 'InStock'],
    ['low_stock', 'LimitedAvailability'],
    ['out_of_stock', 'OutOfStock'],
    ['backorder', 'BackOrder'],
    ['preorder', 'PreOrder'],
  ] as const)('%s -> %s', (status, name) => {
    expect(offerOf(product([server(status)]))).toMatchObject({ availability: `https://schema.org/${name}` })
  })

  it('preorder adds availabilityStarts', () => {
    expect(offerOf(product([server('preorder', { preorder_release_at: '2026-12-01T06:00:00Z' })]))).toMatchObject({ availabilityStarts: '2026-12-01T06:00:00Z' })
  })

  it('one offer per variant', () => {
    const offers = offerOf(product([server('in_stock'), { ...server('out_of_stock'), id: 'v2', sku: 'SKU2' }])) as { availability: string }[]
    expect(offers.map((o) => o.availability)).toEqual(['https://schema.org/InStock', 'https://schema.org/OutOfStock'])
  })

  it('polyfill from available_for_sale / quantity_available', () => {
    expect(offerOf(product([variant({ available_for_sale: false, quantity_available: 0 })]))).toMatchObject({ availability: 'https://schema.org/OutOfStock' })
    expect(offerOf(product([variant({ quantity_available: 3 })]))).toMatchObject({ availability: 'https://schema.org/InStock' })
    expect(offerOf(product([variant({ quantity_available: 3 })]), { lowStockThreshold: 5 })).toMatchObject({ availability: 'https://schema.org/LimitedAvailability' })
  })

  it('never publishes the quantity', () => {
    const p = product([variant({ quantity_available: 3, availability: av({ status: 'low_stock', quantity: 3, max_per_order: 3 }) })])
    const json = JSON.stringify(productJsonLd(p, null, 'https://t.example/products/whey'))
    expect(json).not.toMatch(/quantity|"3"|:3[,}]/)
  })

  it('og product:availability follows the status', () => {
    const meta = (p: Product) => (productMeta(p, null, 'https://t.example/p') as { property?: string; content?: string }[]).find((m) => m.property === 'product:availability')?.content
    expect(meta(product([server('backorder')]))).toBe('backorder')
    expect(meta(product([server('out_of_stock')]))).toBe('out of stock')
    expect(meta(product([server('low_stock')]))).toBe('in stock')
  })
})
