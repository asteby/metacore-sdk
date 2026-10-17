import { describe, expect, it } from 'vitest'
import type { OpeningHours, Shop, ShopBranch } from '@asteby/storefront'
import { localBusinessJsonLd, openingHoursJsonLd } from './seo.js'

const branch = (over: Partial<ShopBranch> = {}): ShopBranch => ({
  id: 'b1', name: 'Centro', address: 'Av. 1', city: 'CDMX', phone: null, lat: 19.4326, lng: -99.1332, hours: null, ...over,
})
const shopWith = (...branches: ShopBranch[]): Shop =>
  ({
    name: 'Tienda', description: null, domain: 'tienda.example', currency_code: 'MXN', locale: 'es-MX', locales: ['es-MX'],
    country_code: 'MX', logo: null, contact: { email: null, phone: null, whatsapp: null }, branches,
    policies: { free_shipping_min: null, returns_days: null },
  }) as Shop

const first = (b: ShopBranch) => localBusinessJsonLd(shopWith(b))[0]!

describe('openingHoursJsonLd', () => {
  it('keeps strict schema.org strings', () => {
    expect(openingHoursJsonLd('Mo-Fr 09:00-19:00, Sa 09:00-14:00')).toEqual(['Mo-Fr 09:00-19:00', 'Sa 09:00-14:00'])
    expect(openingHoursJsonLd('Mo-Sa')).toEqual(['Mo-Sa'])
    expect(openingHoursJsonLd('Su 10:00-14:00')).toEqual(['Su 10:00-14:00'])
  })
  it('omits free text and mixed input entirely', () => {
    expect(openingHoursJsonLd('Lun–Sáb 8:00 a 18:00 · Dom cerrado')).toBeUndefined()
    expect(openingHoursJsonLd('Mo-Fr 09:00-19:00, Sábados 9 a 2')).toBeUndefined()
    expect(openingHoursJsonLd('Mo-Fr 9:00-19:00')).toBeUndefined()
    expect(openingHoursJsonLd('Mon-Fri 09:00-19:00')).toBeUndefined()
    expect(openingHoursJsonLd('Mo-Fr 09:00-19:00,')).toBeUndefined()
  })
  it('handles empty input', () => {
    expect(openingHoursJsonLd('')).toBeUndefined()
    expect(openingHoursJsonLd(null)).toBeUndefined()
    expect(openingHoursJsonLd(undefined)).toBeUndefined()
    expect(openingHoursJsonLd({ weekly: [] })).toBeUndefined()
  })
  it('converts structured hours', () => {
    const h: OpeningHours = { weekly: [1, 2, 3, 4, 5].map((day) => ({ day, open: '9:00', close: '19:00' })) }
    expect(openingHoursJsonLd(h)).toEqual(['Mo-Fr 09:00-19:00'])
  })
})

describe('localBusinessJsonLd hours and geo', () => {
  it('legacy valid string still works', () => {
    expect(first(branch({ hours: 'Mo-Sa 10:00-18:00' })).openingHours).toEqual(['Mo-Sa 10:00-18:00'])
  })
  it('free text hours never produce openingHours', () => {
    const ld = first(branch({ hours: 'Lun–Sáb 8:00 a 18:00 · Dom cerrado' }))
    expect('openingHours' in ld).toBe(false)
  })
  it('structured opening_hours win over the legacy string', () => {
    const ld = first(branch({ hours: 'texto libre', opening_hours: { weekly: [{ day: 6, open: '09:00', close: '14:00' }] } }))
    expect(ld.openingHours).toEqual(['Sa 09:00-14:00'])
  })
  it('null hours and no structured hours omit the property', () => {
    expect('openingHours' in first(branch())).toBe(false)
  })
  it('emits geo only for valid coordinates', () => {
    expect(first(branch()).geo).toEqual({ '@type': 'GeoCoordinates', latitude: 19.4326, longitude: -99.1332 })
    for (const [lat, lng] of [[0, 0], [null, null], [95, 10], [10, 200]] as const) {
      expect('geo' in first(branch({ lat, lng }))).toBe(false)
    }
  })
})
