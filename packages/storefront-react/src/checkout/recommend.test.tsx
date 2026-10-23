// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import axe from 'axe-core'
import type { ShippingRate } from '@asteby/storefront'
import { DeliveryOptions, dedupeRates, recommendRates } from './index.js'

afterEach(cleanup)

const r = (id: string, carrier: string, title: string, amount: string, days: number, over: Partial<ShippingRate> = {}): ShippingRate => ({
  id,
  carrier,
  title,
  service_code: title.toLowerCase().replace(/\s+/g, '_'),
  cost: { amount, currency_code: 'MXN' },
  eta: null,
  eta_days_min: days,
  eta_days_max: days,
  ...over,
})

// The long quote of production (11 services, several per carrier).
const quote: ShippingRate[] = [
  r('fx-so', 'fedex', 'Standard Overnight', '108.82', 4),
  r('es-te', 'estafeta', 'Terrestre', '157.33', 4),
  r('dh-st', 'dhl', 'Standard', '173.52', 3),
  r('px-na', 'paquetexpress', 'Nacional', '173.57', 5),
  r('px-sr', 'paquetexpress', 'Nacional Sin Recolección', '175.38', 1),
  r('es-ex', 'estafeta', 'Servicio Express', '168.37', 3),
  r('dh-ex', 'dhl', 'Express', '305.71', 3),
  r('fx-es', 'fedex', 'Express Saver', '934.22', 5),
  r('fx-po', 'fedex', 'Priority Overnight', '412.10', 1),
  r('ups-st', 'ups', 'Standard', '199.40', 6),
  r('ups-sv', 'ups', 'Saver', '289.90', 2),
]

describe('recommendRates', () => {
  it('recommends the cheapest, the fastest and the best balance; the rest goes by carrier', () => {
    const plan = recommendRates(quote)
    expect(plan.recommended.map((x) => [x.rate.id, x.tags])).toEqual([
      ['fx-so', ['cheapest']],
      ['es-ex', ['best_value']],
      ['px-sr', ['fastest']],
    ])
    expect(plan.moreCount).toBe(8)
    // Groups ordered by their cheapest rate; the carrier appears once per group.
    expect(plan.more.map((g) => g.key)).toEqual(['estafeta', 'dhl', 'paquetexpress', 'ups', 'fedex'])
    expect(plan.more.find((g) => g.key === 'fedex')!.rates.map((x) => x.id)).toEqual(['fx-po', 'fx-es'])
  })

  it('a tie on speed goes to the cheaper rate, and a rate both cheapest and fastest gets both tags', () => {
    expect(recommendRates(quote).recommended.find((x) => x.tags.includes('fastest'))!.rate.id).toBe('px-sr') // 175.38 < 412.10, both 1 day
    const plan = recommendRates([r('a', 'dhl', 'Express', '90', 1), r('b', 'fedex', 'Std', '120', 3), r('c', 'ups', 'Std', '130', 4), r('d', 'ups', 'Saver', '200', 2), r('e', 'estafeta', 'T', '150', 5)])
    expect(plan.recommended[0]).toEqual({ rate: expect.objectContaining({ id: 'a' }), tags: ['cheapest', 'fastest'] })
    expect(plan.recommended).toHaveLength(3)
  })

  it('a short quote shows everything (no toggle for one or two rates)', () => {
    const four = quote.slice(0, 4)
    const plan = recommendRates(four)
    expect(plan.recommended).toHaveLength(4)
    expect(plan.moreCount).toBe(0)
  })

  it('drops repeated services quoted twice, keeping the cheapest', () => {
    const twice = [r('a', 'fedex', 'Express Saver', '300', 2, { provider: 'skydropx' }), r('b', 'FedEx', 'Express Saver', '280', 2, { provider: 'envia' })]
    expect(dedupeRates(twice).map((x) => x.id)).toEqual(['b'])
    expect(recommendRates(twice, { dedupe: false }).recommended).toHaveLength(2)
  })

  it('no price tags across currencies, no speed tag without days', () => {
    const mixed = [r('a', 'dhl', 'X', '10', 2), { ...r('b', 'ups', 'Y', '5', 3), cost: { amount: '5', currency_code: 'USD' } }]
    expect(recommendRates(mixed).recommended.flatMap((x) => x.tags)).toEqual(['fastest'])
    const noDays = [r('a', 'dhl', 'X', '10', 0, { eta_days_min: undefined, eta_days_max: undefined }), r('b', 'ups', 'Y', '20', 0, { eta_days_min: undefined, eta_days_max: undefined })]
    expect(recommendRates(noDays).recommended.flatMap((x) => x.tags)).toEqual(['cheapest'])
  })
})

describe('DeliveryOptions layout="recommended"', () => {
  const now = new Date('2026-10-23T12:00:00Z')
  it('shows three tagged rows and the rest grouped under "more options (N)", without repeating the carrier', () => {
    vi.setSystemTime(now)
    const { container } = render(<DeliveryOptions rates={quote} layout="recommended" />)
    const top = container.querySelectorAll(':scope [data-sf-delivery] > [data-sf-delivery-option]')
    expect(top).toHaveLength(3)
    expect(screen.getByText('Más económico')).toBeTruthy()
    expect(screen.getByText('Más rápido')).toBeTruthy()
    expect(screen.getByText('Recomendado')).toBeTruthy()
    const more = container.querySelector('[data-sf-delivery-more]') as HTMLDetailsElement
    expect(more.open).toBe(false)
    expect(more.querySelector('summary')!.textContent).toBe('Ver más opciones (8)')
    const fedex = container.querySelector('[data-sf-delivery-group="fedex"]')!
    expect(fedex.getAttribute('role')).toBe('group')
    // One mark and one carrier name for the group; the rows show the service only (screen readers still hear the carrier).
    expect(fedex.querySelectorAll('[data-sf-brand-mark]')).toHaveLength(1)
    expect(fedex.querySelectorAll('[data-sf-delivery-option] [data-sf-brand-mark]')).toHaveLength(0)
    expect(screen.getByRole('radio', { name: /FedEx Priority Overnight/ })).toBeTruthy()
    vi.useRealTimers()
  })

  it('opens "more options" by itself when the chosen rate is inside, also in the server HTML', () => {
    const html = renderToString(<DeliveryOptions rates={quote} layout="recommended" defaultValue="rate:fx-es" />)
    expect(html).toMatch(/<details[^>]*open=""[^>]*data-sf-delivery-more|<details[^>]*data-sf-delivery-more[^>]*open=""/)
    const { container } = render(<DeliveryOptions rates={quote} layout="recommended" value="rate:ups-sv" onValueChange={() => {}} />)
    expect((container.querySelector('[data-sf-delivery-more]') as HTMLDetailsElement).open).toBe(true)
  })

  it('every rate stays one native radio in the same group (works without JavaScript)', () => {
    const html = renderToString(<DeliveryOptions rates={quote} layout="recommended" />)
    expect(html.match(/type="radio"/g)).toHaveLength(11)
    expect(html.match(/name="delivery_choice"/g)).toHaveLength(11)
  })

  it('a failed quote is one friendly alert with a retry button', () => {
    const onRetry = vi.fn()
    render(<DeliveryOptions rates={[]} error onRetry={onRetry} />)
    expect(screen.getByRole('alert').textContent).toMatch(/No pudimos consultar las opciones de envío/)
    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <fieldset>
        <legend>Entrega</legend>
        <DeliveryOptions rates={quote} layout="recommended" />
      </fieldset>,
    )
    ;(container.querySelector('[data-sf-delivery-more]') as HTMLDetailsElement).open = true
    const res = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(res.violations.map((v) => v.id)).toEqual([])
  })
})
