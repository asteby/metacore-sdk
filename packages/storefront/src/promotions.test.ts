import { describe, expect, it } from 'vitest'
import { createStorefrontClient } from './client.js'
import { createMockStorefront } from './mock/index.js'
import { NOTE_MAX_LENGTH, clampPercent, couponsBlocked, normalizeNote, promoProgressView, promotionMessages, rewardLabel } from './promotions.js'
import type { CartPromotions, Money } from './types.js'

const mxn = (amount: string): Money => ({ amount, currency_code: 'MXN' })
const tier = (id: string, threshold: string, percent: string, reached: boolean, pos: number) => ({
  id, threshold: mxn(threshold), reward: { kind: 'percent' as const, percent }, reached, percent_of_max: pos,
})

function promos(patch: Partial<CartPromotions> = {}): CartPromotions {
  return {
    version: 1,
    promotion_id: 'p1',
    title: 'Descuento por monto',
    basis: mxn('749.00'),
    tiers: [tier('t5', '2300.00', '5', false, 85), tier('t10', '2700.00', '10', false, 100)],
    applied: null,
    next_tier: { tier_id: 't5', threshold: mxn('2300.00'), remaining: mxn('1551.00'), reward: { kind: 'percent', percent: '5' }, percent: 32 },
    max_reached: false,
    percent_of_max: 27,
    combines_with_codes: true,
    ends_at: null,
    excluded_line_ids: [],
    suppressed: null,
    free_shipping: null,
    ...patch,
  }
}

describe('rewardLabel', () => {
  it.each([
    [{ kind: 'percent', percent: '5' }, 'es-MX', '5 %'],
    [{ kind: 'percent', percent: '7.5' }, 'es-MX', '7.5 %'],
    [{ kind: 'percent', percent: '10' }, 'en-US', '10%'],
    [{ kind: 'fixed', amount: mxn('250.00') }, 'es-MX', '$250'],
    [{ kind: 'free_shipping' }, 'es-MX', 'Envío gratis'],
    [{ kind: 'free_shipping' }, 'en-US', 'Free shipping'],
  ] as const)('%j (%s) -> %s', (reward, locale, expected) => {
    expect(rewardLabel(reward, locale).replace(/ /g, ' ')).toBe(expected)
  })
})

describe('promoProgressView: discount bar', () => {
  it('no promotions -> nothing', () => {
    expect(promoProgressView(null)).toEqual({ discount: null, shipping: null })
    expect(promoProgressView(undefined)).toEqual({ discount: null, shipping: null })
  })
  it('first tier pending uses the server remaining and percent verbatim', () => {
    const v = promoProgressView(promos(), 'es-MX').discount!
    expect(v.state).toBe('next')
    expect(v.percent).toBe(27)
    expect(v.text).toBe('Te faltan $1,551 para obtener 5 % de descuento')
    expect(v.rewardText).toBe('5 %')
    expect(v.tiers.map((t) => [t.label, t.threshold, t.reached])).toEqual([['5 %', '$2,300', false], ['10 %', '$2,700', false]])
  })
  it('tier reached with another ahead -> upgrade text', () => {
    const v = promoProgressView(
      promos({
        applied: { tier_id: 't5', reward: { kind: 'percent', percent: '5' }, amount: mxn('115.00') },
        next_tier: { tier_id: 't10', threshold: mxn('2700.00'), remaining: mxn('400.00'), reward: { kind: 'percent', percent: '10' }, percent: 85 },
        percent_of_max: 85,
      }),
      'es-MX',
    ).discount!
    expect(v.state).toBe('upgrade')
    expect(v.text).toBe('Te faltan $400 para pasar de 5 % a 10 % de descuento')
    expect(v.appliedText).toBe('¡Tienes 5 % de descuento!')
  })
  it('max level', () => {
    const v = promoProgressView(
      promos({ applied: { tier_id: 't10', reward: { kind: 'percent', percent: '10' }, amount: mxn('270.00') }, next_tier: null, max_reached: true, percent_of_max: 100 }),
      'en-US',
    ).discount!
    expect(v.state).toBe('max')
    expect(v.percent).toBe(100)
    expect(v.text).toContain('10%')
    expect(v.remaining).toBeNull()
  })
  it('code better than the tier', () => {
    const v = promoProgressView(promos({ suppressed: { reason: 'code_better' }, next_tier: null }), 'es').discount!
    expect(v.state).toBe('suppressed')
  })
  it('clamps weird server percentages for aria', () => {
    expect(promoProgressView(promos({ percent_of_max: 140 })).discount!.percent).toBe(100)
    expect(promoProgressView(promos({ percent_of_max: -3 })).discount!.percent).toBe(0)
    expect(clampPercent('abc')).toBe(0)
    expect(clampPercent(32.6)).toBe(33)
  })
})

describe('promoProgressView: free-shipping bar', () => {
  const fs = (patch: Partial<NonNullable<CartPromotions['free_shipping']>>): CartPromotions =>
    promos({ tiers: [], next_tier: null, applied: null, free_shipping: { threshold: mxn('1500.00'), basis: mxn('900.00'), remaining: mxn('600.00'), reached: false, percent: 60, ...patch } })
  it.each([
    ['progress', fs({}), 'progress', 60, 'Te faltan $600 para el envío gratis', true],
    ['reached', fs({ reached: true, remaining: mxn('0.00'), percent: 100 }), 'reached', 100, '¡Felicidades! Tienes envío gratis', true],
    ['no minimum (threshold 0)', fs({ threshold: mxn('0.00'), reached: true }), 'always', 100, 'Envío gratis en todo tu pedido', false],
  ] as const)('%s', (_n, p, state, percent, text, showBar) => {
    const v = promoProgressView(p, 'es-MX').shipping!
    expect([v.state, v.percent, v.text, v.showBar]).toEqual([state, percent, text, showBar])
  })
  it('discount bar is absent when only free shipping exists', () => {
    expect(promoProgressView(fs({})).discount).toBeNull()
  })
})

describe('notes and messages', () => {
  it.each([
    ['  hola ', 'hola'],
    ['', null],
    ['   ', null],
    [null, null],
    ['x'.repeat(NOTE_MAX_LENGTH + 50), 'x'.repeat(NOTE_MAX_LENGTH)],
  ])('normalizeNote(%j)', (input, out) => expect(normalizeNote(input as string | null)).toBe(out))
  it('es and en catalogs have the same keys', () => {
    expect(Object.keys(promotionMessages('es')).sort()).toEqual(Object.keys(promotionMessages('en')).sort())
  })
})

describe('client + mock: note, recommendations, promotions', () => {
  const mock = createMockStorefront({ announcements: [] })
  const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
  it('setNote stores, trims and clears; rejects > 1000', async () => {
    const cart = await sf.carts.create()
    expect((await sf.carts.setNote(cart.id, '  sin picante ')).note).toBe('sin picante')
    expect((await sf.carts.setNote(cart.id, null)).note).toBeNull()
    await expect(sf.carts.setNote(cart.id, 'x'.repeat(1001))).rejects.toMatchObject({ status: 400 })
  })
  it('recommendations only returns sellable variants and skips what is in the cart', async () => {
    const v = mock.state.products.flatMap((p) => p.variants).find((x) => x.available_for_sale)!
    const cart = await sf.carts.create({ lines: [{ variant_id: v.id, quantity: 1 }] })
    const recs = await sf.carts.recommendations(cart.id, { first: 3, placement: 'checkout_upsell' })
    expect(recs.nodes.length).toBeGreaterThan(0)
    expect(recs.nodes.length).toBeLessThanOrEqual(3)
    for (const n of recs.nodes) {
      expect(n.variants.every((x) => x.available_for_sale)).toBe(true)
      expect(n.variants.some((x) => x.id === v.id)).toBe(false)
    }
  })
  it('promotions.list answers', async () => {
    expect(await sf.promotions.list()).toEqual({ nodes: [], announcements: [] })
  })
})

describe('couponsBlocked', () => {
  it('is true only when the rule in force blocks codes', () => {
    expect(couponsBlocked(promos({ blocks_codes: true }))).toBe(true)
    expect(couponsBlocked(promos({ blocks_codes: false }))).toBe(false)
    expect(couponsBlocked(promos())).toBe(false)
    expect(couponsBlocked(null)).toBe(false)
    expect(couponsBlocked(undefined)).toBe(false)
  })
})
