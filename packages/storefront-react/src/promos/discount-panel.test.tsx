// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { CartCost, CartPromotions, Money } from '@asteby/storefront'
import { DiscountPanel } from './index.js'
import { OrderTotals } from '../checkout/index.js'

const mxn = (amount: string): Money => ({ amount, currency_code: 'MXN' })
afterEach(() => cleanup())

const promotions = (patch: Partial<CartPromotions> = {}): CartPromotions =>
  ({
    version: 1,
    promotion_id: 'p',
    title: 'Descuentos por monto',
    basis: mxn('725.89'),
    tiers: [
      { id: 't5', threshold: mxn('500.00'), reward: { kind: 'percent', percent: '5' }, reached: true, percent_of_max: 50 },
      { id: 't10', threshold: mxn('1000.00'), reward: { kind: 'percent', percent: '10' }, reached: false, percent_of_max: 100 },
    ],
    applied: { tier_id: 't5', reward: { kind: 'percent', percent: '5' }, amount: mxn('36.29') },
    next_tier: { tier_id: 't10', threshold: mxn('1000.00'), remaining: mxn('274.11'), reward: { kind: 'percent', percent: '10' }, percent: 72.59 },
    max_reached: false,
    percent_of_max: 72.59,
    combines_with_codes: true,
    ends_at: null,
    excluded_line_ids: [],
    suppressed: null,
    free_shipping: { threshold: mxn('0.00'), basis: mxn('725.89'), remaining: mxn('0.00'), reached: true, percent: 100 },
    ...patch,
  }) as CartPromotions

describe('DiscountPanel', () => {
  it('shows bars and an open coupon field in the aside and the cart layouts', () => {
    for (const layout of ['aside', 'cart'] as const) {
      const { container, unmount } = render(<DiscountPanel promotions={promotions()} codes={[]} layout={layout} locale="es-MX" />)
      expect(container.querySelector('[data-sf-discount-panel]')?.getAttribute('data-layout')).toBe(layout)
      expect(container.querySelector('[data-sf-promo-bar="discount"]')).not.toBeNull()
      expect(screen.getByText(/para pasar de 5 % a 10 % de descuento/)).toBeTruthy()
      expect(container.querySelector('[data-sf-discount-code]')).not.toBeNull()
      expect(container.querySelector('details')).toBeNull()
      unmount()
    }
  })

  it('folds the coupon in the drawer', () => {
    const { container } = render(<DiscountPanel promotions={promotions()} codes={[]} layout="drawer" locale="es-MX" />)
    expect(container.querySelector('details[data-sf-checkout-discount-code]')).not.toBeNull()
    expect(screen.getByText('¿Tienes un cupón?')).toBeTruthy()
  })

  it('without promotions it still offers the coupon; with coupons blocked and no bars it renders nothing', () => {
    const a = render(<DiscountPanel promotions={null} codes={[]} />)
    expect(a.container.querySelector('[data-sf-promo-bars]')).toBeNull()
    expect(a.container.querySelector('[data-sf-discount-code]')).not.toBeNull()
    a.unmount()
    const b = render(<DiscountPanel promotions={{ ...promotions(), tiers: [], next_tier: null, applied: null, free_shipping: null, blocks_codes: true }} codes={[]} />)
    expect(b.container.innerHTML).toBe('')
  })

  it('options: no bars, no coupon', () => {
    const { container } = render(<DiscountPanel promotions={promotions()} codes={[]} bars={false} coupon={false} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('OrderTotals discount breakdown', () => {
  const cost = (discounts: CartCost['discounts'], discount: string): CartCost => ({
    subtotal: mxn('1000.00'),
    discount: mxn(discount),
    discounts,
    shipping: null,
    tax: null,
    total: mxn(String(1000 - Number(discount))),
    tax_included: true,
  })
  it('one source: a single «Descuento» row', () => {
    const { container } = render(<dl><OrderTotals cost={cost([{ kind: 'automatic', id: 'a', title: 'Descuento por monto (tienda)', code: null, amount: mxn('50.00') }], '50.00')} /></dl>)
    expect(container.querySelectorAll('[data-sf-summary-row="discount"]').length).toBe(1)
    expect(container.querySelectorAll('[data-sf-summary-row="source"]').length).toBe(0)
    expect(container.textContent).not.toContain('(tienda)')
  })
  it('two sources: the total plus Promoción por monto and Cupón CODE, never the internal names', () => {
    const { container } = render(
      <OrderTotals
        cost={cost(
          [
            { kind: 'automatic', id: 'a', title: 'Descuento por monto (tienda)', code: null, amount: mxn('50.00') },
            { kind: 'code', id: 'c', title: 'Cupón interno', code: 'VERANO', amount: mxn('100.00') },
          ],
          '150.00',
        )}
      />,
    )
    expect(container.querySelector('[data-sf-summary-row="discount"]')?.textContent).toContain('150.00')
    const rows = [...container.querySelectorAll('[data-sf-summary-row="source"]')].map((r) => r.textContent)
    expect(rows).toEqual(['Promoción por monto−$50.00', 'Cupón VERANO−$100.00'])
    expect(container.textContent).not.toContain('(tienda)')
    expect(container.textContent).not.toContain('interno')
  })
})
