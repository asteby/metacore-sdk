// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import axe from 'axe-core'
import type { ShippingRate } from '@asteby/storefront'
import { BrandMark, DeliveryOptions, isQuoteChange, matchRate, brandKey, brandName, findBrand, listBrands, quoteDeadline, quoteNote, rateBadges, rateEta, rateService } from './index.js'

afterEach(cleanup)

const rate = (over: Partial<ShippingRate> & { id: string; amount: string }): ShippingRate => ({
  title: 'Standard',
  eta: null,
  cost: { amount: over.amount, currency_code: 'MXN' },
  ...over,
})

const rates: ShippingRate[] = [
  rate({ id: 'a', amount: '108.82', title: 'Standard Overnight', carrier: 'fedex', eta_days_min: 4, eta_days_max: 4, expires_at: '2026-10-24T03:39:00Z' }),
  rate({ id: 'b', amount: '157.33', title: 'Terrestre', carrier: 'estafeta', eta_days_min: 4, eta_days_max: 4, expires_at: '2026-10-24T03:39:00Z' }),
  rate({ id: 'c', amount: '175.38', title: 'Nacional Sin Recolección', carrier: 'paquetexpress', eta_days_min: 1, eta_days_max: 1, expires_at: '2026-10-24T04:00:00Z' }),
]

describe('brand catalog', () => {
  it('normalizes provider identifiers to one key', () => {
    expect(brandKey('FedEx México')).toBe('fedex')
    expect(brandKey('fedex_mx')).toBe('fedex')
    expect(brandKey('7-Eleven')).toBe('7eleven')
    expect(brandKey('clabe')).toBe('spei')
    expect(brandKey('Circle K')).toBe('circlek')
    expect(brandKey('Correos de México')).toBe('correosdemexico')
  })

  it('gives the commercial name, and title case for an unknown carrier', () => {
    expect(brandName('fedex')).toBe('FedEx')
    expect(brandName('dhl')).toBe('DHL')
    expect(brandName('paquetexpress')).toBe('Paquetexpress')
    expect(brandName('envios_rapidos')).toBe('Envios Rapidos')
    expect(brandName('Envía Plus')).toBe('Envía Plus')
    expect(brandName('')).toBeNull()
  })

  it('covers the carriers and cash points the addons send today', () => {
    for (const k of ['fedex', 'dhl', 'estafeta', 'paquetexpress', 'ups', 'redpack']) expect(findBrand(k)?.kind).toBe('carrier')
    // Cash catalog ids of the payment addon (stp, oxxo, paycash points, banks).
    for (const k of ['stp', 'oxxo', '7eleven', 'circlek', 'soriana', 'extra', 'kiosko', 'calimax', 'farmaciasyza', 'santander', 'bbva', 'casaley', 'citibanamex', 'telecomm', 'chedraui']) {
      expect(findBrand(k), k).not.toBeNull()
    }
    for (const k of ['visa', 'mastercard', 'amex', 'mercadopago']) expect(findBrand(k)).not.toBeNull()
  })

  it('every badge text has AA contrast on its background', () => {
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
    }
    for (const b of listBrands()) {
      if (b.shape) continue
      const [l1, l2] = [lum(b.bg), lum(b.fg)].sort((x, y) => y - x)
      // Bold text ≥ 14px-equivalent: large-text AA (3:1) is the floor.
      expect((l1! + 0.05) / (l2! + 0.05), b.key).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('BrandMark', () => {
  it('the typographic fallback is a decorative inline SVG with a fixed box (no request, no layout shift)', () => {
    // `spei` has no published logo (see brands/LOGOS.md): it keeps a generic transfer badge.
    const html = renderToString(<BrandMark brand="spei" size={20} />)
    expect(html).toContain('<svg')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('width="30"')
    expect(html).toContain('height="20"')
    expect(html).toContain('SPEI')
    // Generic transfer badge (arrows + text), not an imitation of the official mark.
    expect(html).toMatch(/>SPEI<\/text>/)
    expect(html).toContain('<path')
    expect(html).toContain('data-sf-brand-mark="spei"')
    expect(html).toContain('data-sf-brand-source="badge"')
  })

  it('draws a monogram for an unknown brand and names itself with title', () => {
    const html = renderToString(<BrandMark brand="envios rapidos" title="Envios Rapidos" />)
    expect(html).toContain('>ER<')
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="Envios Rapidos"')
  })

  it('uses only an https logo from the provider, lazily and with dimensions', () => {
    const ok = renderToString(<BrandMark brand="oxxo" logoUrl="https://cdn.example.com/oxxo.svg" />)
    expect(ok).toContain('<img')
    expect(ok).toContain('loading="lazy"')
    expect(ok).toContain('data-sf-brand-source="provider"')
    const bad = renderToString(<BrandMark brand="oxxo" logoUrl="javascript:alert(1)" />)
    expect(bad).not.toContain('javascript:')
    expect(bad).toContain('data-sf-brand-source="logo"')
  })
})

describe('delivery helpers', () => {
  it('writes the arrival time in business days', () => {
    expect(rateEta({ eta: null, eta_days_min: 4, eta_days_max: 4 })).toBe('Llega en 4 días hábiles')
    expect(rateEta({ eta: null, eta_days_min: 1, eta_days_max: 1 })).toBe('Llega en 1 día hábil')
    expect(rateEta({ eta: null, eta_days_min: 2, eta_days_max: 5 })).toBe('Llega en 2 a 5 días hábiles')
    expect(rateEta({ eta: '3-5 días' })).toBe('3-5 días')
  })

  it('does not repeat the carrier in the service name', () => {
    expect(rateService({ title: 'FedEx Express Saver', carrier: 'fedex' })).toBe('Express Saver')
    expect(rateService({ title: 'Standard Overnight', carrier: 'fedex' })).toBe('Standard Overnight')
    expect(rateService({ title: 'DHL', carrier: 'dhl' })).toBe('DHL')
  })

  it('flags a strict cheapest and a strict fastest, nothing on ties', () => {
    const b = rateBadges(rates)
    expect(b.get('a')).toEqual(['cheapest'])
    expect(b.get('c')).toEqual(['fastest'])
    expect(b.get('b')).toBeUndefined()
    expect(rateBadges([rates[0]!]).size).toBe(0)
    const tie = rateBadges([rates[0]!, { ...rates[1]!, cost: rates[0]!.cost, eta_days_max: 4 }])
    expect(tie.size).toBe(0)
  })

  it('writes one deadline note in the given time zone, "soon" near the end', () => {
    const deadline = quoteDeadline(rates)!
    expect(deadline.toISOString()).toBe('2026-10-24T03:39:00.000Z')
    const tz = 'America/Mexico_City'
    const tomorrow = quoteNote(deadline, { now: new Date('2026-10-23T05:00:00Z'), timeZone: tz })!
    expect(tomorrow.text).toMatch(/^Precios de envío vigentes hasta (las|mañana)/)
    expect(tomorrow.text).not.toContain('UTC')
    const today = quoteNote(deadline, { now: new Date('2026-10-23T22:00:00Z'), timeZone: tz })!
    expect(today.text).toMatch(/^Precios de envío vigentes hasta las 9:39/)
    expect(today.text).not.toMatch(/\.\.$/)
    const later = quoteNote(deadline, { now: new Date('2026-10-20T12:00:00Z'), timeZone: tz })!
    expect(later.text).toContain('hasta el 23 oct')
    const soon = quoteNote(deadline, { now: new Date('2026-10-24T03:30:00Z'), timeZone: tz })!
    expect(soon.soon).toBe(true)
    expect(quoteNote(deadline, { now: new Date('2026-10-25T00:00:00Z') })).toBeNull()
  })
})

describe('re-quote', () => {
  it('recognizes an expired or changed quote, today (generic 422) and with an explicit code', () => {
    expect(isQuoteChange({ status: 409, code: 'quote_expired' })).toBe(true)
    expect(isQuoteChange({ status: 422, code: 'rate_expired' })).toBe(true)
    expect(isQuoteChange({ status: 409 })).toBe(true)
    expect(isQuoteChange({ status: 422, code: 'invalid_input' })).toBe(true)
    expect(isQuoteChange({ status: 422, code: 'invalid_input', field: 'rate_id' })).toBe(true)
    expect(isQuoteChange({ status: 422, field: 'email' })).toBe(false)
    expect(isQuoteChange({ status: 404, code: 'not_found' })).toBe(false)
    expect(isQuoteChange({ status: 503 })).toBe(false)
    expect(isQuoteChange(null)).toBe(false)
  })
  it('keeps the chosen service across new rate ids', () => {
    const fresh = rates.map((r) => ({ ...r, id: `${r.id}-2` }))
    expect(matchRate(rates[1], fresh)?.id).toBe('b-2')
    expect(matchRate({ carrier: 'ups', title: 'Ground' }, fresh)).toBeNull()
    expect(matchRate({ carrier: 'fedex', service_code: 'SO', title: 'x' }, [{ ...fresh[0]!, service_code: 'SO' }])?.id).toBe('a-2')
  })
  it('DeliveryOptions says the rates were refreshed', () => {
    const { container } = render(<DeliveryOptions rates={rates} requoted />)
    expect(container.querySelector('[data-sf-delivery-requoted]')!.textContent).toMatch(/cambiaron/)
  })
})

describe('DeliveryOptions', () => {
  it('renders native radios with carrier name, service, ETA, badges and the first rate checked', () => {
    const { container } = render(
      <form>
        <fieldset>
          <legend>Entrega</legend>
          <DeliveryOptions rates={rates} pickup={[{ branch_id: 's1', name: 'Centro' }]} renderAmount={(m) => `$${m.amount}`} />
        </fieldset>
      </form>,
    )
    const radios = [...container.querySelectorAll('input[name="delivery_choice"]')] as HTMLInputElement[]
    expect(radios.map((r) => r.value)).toEqual(['rate:a', 'rate:b', 'rate:c', 'pickup:s1'])
    expect(radios[0]!.checked).toBe(true)
    const first = container.querySelector('[data-sf-delivery-option]')!
    expect(first.querySelector('[data-sf-delivery-carrier]')!.textContent).toBe('FedEx')
    expect(first.querySelector('[data-sf-delivery-service]')!.textContent).toBe('Standard Overnight')
    expect(first.querySelector('[data-sf-delivery-eta]')!.textContent).toBe('Llega en 4 días hábiles')
    expect(first.querySelector('[data-sf-delivery-badge="cheapest"]')!.textContent).toBe('Más económico')
    expect(first.querySelector('[data-sf-brand-mark="fedex"]')).not.toBeNull()
    expect(container.textContent).toContain('Recoger en Centro')
    expect(container.textContent).not.toContain('UTC')
  })

  it('shows ONE deadline note only after hydration, in a line reserved on the server', async () => {
    const html = renderToString(<DeliveryOptions rates={rates} />)
    expect(html.match(/data-sf-delivery-note/g)?.length).toBe(1)
    expect(html).not.toContain('vigentes')
    const future = rates.map((r) => ({ ...r, expires_at: new Date(Date.now() + 3 * 3600_000).toISOString() }))
    const { container } = render(<DeliveryOptions rates={future} />)
    await waitFor(() => expect(container.querySelector('[data-sf-delivery-note]')!.textContent).toMatch(/vigentes hasta/))
    expect(container.querySelectorAll('[data-sf-delivery-note]').length).toBe(1)
  })

  it('shows skeleton rows while quoting with no rates yet, and is aria-busy', () => {
    const { container } = render(<DeliveryOptions rates={[]} loading />)
    expect(container.querySelector('[data-sf-delivery]')!.getAttribute('aria-busy')).toBe('true')
    expect(container.querySelectorAll('[data-sf-delivery-skeleton]').length).toBe(3)
    expect(container.querySelector('[role="status"]')!.textContent).toBe('Buscando opciones de envío…')
  })

  it('supports a controlled value and custom form values', () => {
    let picked = ''
    const { container } = render(<DeliveryOptions rates={rates} value="r-b" rateValue={(r) => `r-${r.id}`} onValueChange={(v) => (picked = v)} />)
    const radios = [...container.querySelectorAll('input')] as HTMLInputElement[]
    expect(radios[1]!.checked).toBe(true)
    radios[2]!.click()
    expect(picked).toBe('r-c')
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <fieldset>
        <legend>Entrega</legend>
        <DeliveryOptions rates={rates} partial />
      </fieldset>,
    )
    const res = await axe.run(container, { rules: { region: { enabled: false } } })
    expect(res.violations.map((v) => v.id)).toEqual([])
  })
})
