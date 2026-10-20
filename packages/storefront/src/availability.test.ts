import { describe, expect, it } from 'vitest'
import {
  availabilityMessages,
  availabilityView,
  cartLineProblemView,
  productAvailability,
  resolveAvailability,
  schemaAvailability,
} from './availability.js'
import type { Availability, AvailabilityStatus } from './types.js'

const base: Availability = { status: 'in_stock', quantity: null, max_per_order: null, restock_eta: null, preorder_release_at: null, notify_available: false }
const av = (patch: Partial<Availability>): Availability => ({ ...base, ...patch })

describe('availabilityView (table)', () => {
  type Row = [name: string, input: Availability, locale: string, expected: Record<string, unknown>]
  const rows: Row[] = [
    ['in_stock es', av({}), 'es-MX', { tone: 'success', label: 'Disponible', sublabel: null, ctaLabel: 'Agregar al carrito', ctaEnabled: true, showNotify: false, showOnCard: false }],
    ['in_stock en', av({}), 'en', { label: 'In stock', ctaLabel: 'Add to cart' }],
    ['low_stock with n', av({ status: 'low_stock', quantity: 3, max_per_order: 3 }), 'es', { tone: 'warning', label: 'Quedan 3', srText: 'Quedan solo 3 piezas', ctaEnabled: true, maxPerOrder: 3, showOnCard: true }],
    ['low_stock with n en', av({ status: 'low_stock', quantity: 1 }), 'en-US', { label: 'Only 1 left' }],
    ['low_stock without n (no invented number)', av({ status: 'low_stock' }), 'es', { label: 'Pocas piezas', srText: 'Quedan pocas piezas' }],
    ['out_of_stock', av({ status: 'out_of_stock' }), 'es', { tone: 'danger', label: 'Agotado', ctaLabel: 'Agotado', ctaEnabled: false, showNotify: false, showOnCard: true }],
    ['out_of_stock + notify', av({ status: 'out_of_stock', notify_available: true }), 'es', { showNotify: true }],
    ['backorder with eta', av({ status: 'backorder', restock_eta: '2026-11-05' }), 'es', { tone: 'info', label: 'Bajo pedido', ctaLabel: 'Pedir bajo pedido', ctaEnabled: true, sublabel: 'Se envía a partir del 5 de noviembre de 2026', showNotify: false }],
    ['backorder without eta', av({ status: 'backorder' }), 'es', { sublabel: null, srText: 'Disponible bajo pedido' }],
    ['preorder with date', av({ status: 'preorder', preorder_release_at: '2026-12-01T06:00:00Z' }), 'en', { label: 'Pre-order', ctaEnabled: true, sublabel: 'Available on December 1, 2026' }],
    ['preorder falls back to eta', av({ status: 'preorder', restock_eta: '2026-12-15' }), 'es', { sublabel: 'Sale a la venta el 15 de diciembre de 2026' }],
    ['max_per_order 0 is no cap', av({ max_per_order: 0 }), 'es', { maxPerOrder: null }],
    ['unknown status -> out_of_stock', { ...base, status: 'whatever' as AvailabilityStatus }, 'es', { status: 'out_of_stock', ctaEnabled: false }],
    ['unknown locale -> es', av({}), 'fr', { label: 'Disponible' }],
  ]
  it.each(rows)('%s', (_n, input, locale, expected) => {
    expect(availabilityView(input, locale)).toMatchObject(expected)
  })

  it('overrides texts per key, not logic', () => {
    const v = availabilityView(av({ status: 'low_stock', quantity: 2 }), 'es', { messages: { 'status.low_stock_n': '¡Últimas {n}!' } })
    expect(v.label).toBe('¡Últimas 2!')
    expect(v.tone).toBe('warning')
    expect(availabilityMessages('es', { 'bogus.key': 'x' } as never)['status.in_stock']).toBe('Disponible')
  })

  it('never puts a hidden quantity in any text', () => {
    for (const status of ['in_stock', 'out_of_stock', 'backorder', 'preorder'] as const) {
      const v = availabilityView(av({ status }), 'es')
      expect(`${v.label} ${v.srText} ${v.ctaLabel}`).not.toMatch(/\d/)
    }
  })
})

describe('resolveAvailability polyfill', () => {
  it('uses the server availability when present', () => {
    const a = av({ status: 'backorder' })
    expect(resolveAvailability({ available_for_sale: false, quantity_available: 0, availability: a })).toBe(a)
  })

  const cases: [string, { available_for_sale: boolean; quantity_available: number | null }, number | undefined, Partial<Availability>][] = [
    ['untracked', { available_for_sale: true, quantity_available: null }, undefined, { status: 'in_stock', quantity: null, max_per_order: null }],
    ['plenty', { available_for_sale: true, quantity_available: 40 }, undefined, { status: 'in_stock', max_per_order: 40 }],
    ['low by shop threshold', { available_for_sale: true, quantity_available: 4 }, 5, { status: 'low_stock', quantity: 4 }],
    ['at threshold', { available_for_sale: true, quantity_available: 5 }, 5, { status: 'low_stock' }],
    ['above threshold', { available_for_sale: true, quantity_available: 6 }, 5, { status: 'in_stock' }],
    ['no threshold never low', { available_for_sale: true, quantity_available: 1 }, undefined, { status: 'in_stock' }],
    ['not for sale', { available_for_sale: false, quantity_available: 0 }, 5, { status: 'out_of_stock', quantity: null, max_per_order: null }],
    ['flag says sale but zero', { available_for_sale: true, quantity_available: 0 }, undefined, { status: 'out_of_stock' }],
    ['never offers notify (old servers have no route)', { available_for_sale: false, quantity_available: 0 }, undefined, { notify_available: false }],
  ]
  it.each(cases)('%s', (_n, src, lowStockThreshold, expected) => {
    expect(resolveAvailability(src, { lowStockThreshold })).toMatchObject(expected)
  })

  it('ignores a malformed availability', () => {
    expect(resolveAvailability({ available_for_sale: false, quantity_available: 0, availability: {} as Availability }).status).toBe('out_of_stock')
  })

  it('product summary: best state among variants', () => {
    const v = (available_for_sale: boolean, quantity_available: number | null) => ({ available_for_sale, quantity_available }) as never
    expect(productAvailability({ available_for_sale: true, variants: [v(false, 0), v(true, 9)] }).status).toBe('in_stock')
    expect(productAvailability({ available_for_sale: false, variants: [v(false, 0), v(false, 0)] }).status).toBe('out_of_stock')
  })
})

describe('cartLineProblemView', () => {
  it('out of stock: only remove', () => {
    const v = cartLineProblemView({ code: 'out_of_stock', max_quantity: 0 }, 'es')
    expect(v).toMatchObject({ message: 'Ya no hay existencias', adjustTo: null, adjustLabel: null, removeLabel: 'Quitar' })
  })
  it('insufficient with visible max: adjust to N', () => {
    expect(cartLineProblemView({ code: 'insufficient_stock', max_quantity: 2 }, 'es', { lineQuantity: 5 })).toMatchObject({ message: 'Solo puedes llevar 2', adjustTo: 2, adjustLabel: 'Ajustar a 2' })
  })
  it('insufficient with hidden max: no number, no adjust', () => {
    const v = cartLineProblemView({ code: 'insufficient_stock', max_quantity: null }, 'en')
    expect(v.message).toBe('Not enough stock for this quantity')
    expect(v.adjustTo).toBeNull()
  })
  it('max equal to the line quantity: no adjust', () => {
    expect(cartLineProblemView({ code: 'insufficient_stock', max_quantity: 5 }, 'es', { lineQuantity: 5 }).adjustTo).toBeNull()
  })
  it('accepts an error line', () => {
    expect(cartLineProblemView({ line_id: 'l', variant_id: 'v', sku: 's', status: 'out_of_stock', max_quantity: null }, 'es').code).toBe('out_of_stock')
  })
})

describe('schemaAvailability', () => {
  it.each([
    ['in_stock', 'InStock'],
    ['low_stock', 'LimitedAvailability'],
    ['out_of_stock', 'OutOfStock'],
    ['backorder', 'BackOrder'],
    ['preorder', 'PreOrder'],
    ['nope', 'OutOfStock'],
  ])('%s', (s, name) => expect(schemaAvailability(s)).toBe(`https://schema.org/${name}`))
})
