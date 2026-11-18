import { describe, expect, it } from 'vitest'
import { normalizeMapPoints } from './map-points'

const rows = [
  { id: 'a', name: 'Acme', lat: 14.6, lng: -90.5, status: 'ok', prec: 'country', iso: 'GT', version: '1.2', plan: 'pro', note: null },
  { id: 'b', name: 'Beta', lat: 19.4, lng: -99.1, status: 'ok', prec: 'street', iso: ' ', version: '2.0', plan: 'free' },
]
const block = (extra: Record<string, unknown>) => ({ type: 'map', summary: 's', source: 'data.p', ...extra })

describe('normalizeMapPoints: popup, precision, precision_field, area_field', () => {
  it('without the new fields the output is unchanged (unmapped columns as details, no precision/area)', () => {
    const [a] = normalizeMapPoints(block({}) as never, rows)
    expect(a!.precision).toBeUndefined()
    expect(a!.area).toBeUndefined()
    expect(a!.details.map((d) => d.label)).toEqual(['prec', 'iso', 'version', 'plan'])
  })

  it('popup lists exactly those columns, in order, skipping empty values', () => {
    const [a, b] = normalizeMapPoints(block({ popup: ['plan', 'note', 'version'] }) as never, rows)
    expect(a!.details).toEqual([{ label: 'plan', value: 'pro' }, { label: 'version', value: '1.2' }])
    expect(b!.details.map((d) => d.label)).toEqual(['plan', 'version'])
  })

  it('precision_field is per row (invalid values drop to the constant, else undefined); area_field trims and drops blanks', () => {
    const [a, b] = normalizeMapPoints(block({ precision_field: 'prec', area_field: 'iso' }) as never, rows)
    expect([a!.precision, a!.area]).toEqual(['country', 'GT'])
    expect([b!.precision, b!.area]).toEqual([undefined, undefined])
    const [, b2] = normalizeMapPoints(block({ precision_field: 'prec', precision: 'city' }) as never, rows)
    expect(b2!.precision).toBe('city')
  })

  it('a constant precision applies to every point, inline ones included; garbage is ignored', () => {
    const [c] = normalizeMapPoints(block({ precision: 'city' }) as never, rows)
    expect(c!.precision).toBe('city')
    const inline = normalizeMapPoints({ type: 'map', summary: 's', precision: 'country', points: [{ key: 'k', lat: 1, lng: 2, label: 'K' }] } as never)
    expect(inline[0]!.precision).toBe('country')
    expect(normalizeMapPoints(block({ precision: 'street' }) as never, rows)[0]!.precision).toBeUndefined()
  })
})
