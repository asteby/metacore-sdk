import { describe, expect, it } from 'vitest'
import vectors from './geo-vectors.json'
import {
  directionsUrl,
  distanceKm,
  formatDistance,
  formatOpeningHours,
  isValidPoint,
  openStatus,
  parseLatLng,
  rankByDistance,
  toSchemaOpeningHours,
  type OpeningHours,
} from './geo.js'

type HoursDef = OpeningHours & { base?: string }
const defs = vectors.hours as unknown as Record<string, HoursDef>
const hoursOf = (name: string): OpeningHours => {
  const d = defs[name]!
  return d.base ? { weekly: defs[d.base]!.weekly, exceptions: d.exceptions } : { weekly: d.weekly }
}

describe('distanceKm', () => {
  for (const v of vectors.distance) {
    it(v.name, () => expect(Math.abs(distanceKm(v.a, v.b) - v.km)).toBeLessThanOrEqual(v.tol))
  }
  it('uses the documented earth radius', () => {
    expect(vectors.earthRadiusKm).toBe(6371.0088)
    expect(distanceKm({ lat: 10, lng: 20 }, { lat: 11, lng: 20 })).toBeCloseTo((6371.0088 * Math.PI) / 180, 9)
  })
})

describe('isValidPoint / parseLatLng', () => {
  for (const v of vectors.validPoint) {
    it(`${v.lat},${v.lng} -> ${v.valid}`, () => expect(isValidPoint(v)).toBe(v.valid))
  }
  it('rejects non-finite, missing and non-number values', () => {
    expect(isValidPoint({ lat: NaN, lng: 1 })).toBe(false)
    expect(isValidPoint({ lat: Infinity, lng: 1 })).toBe(false)
    expect(isValidPoint(null)).toBe(false)
    expect(isValidPoint(undefined)).toBe(false)
    expect(isValidPoint({ lat: '1' as unknown as number, lng: 1 })).toBe(false)
  })
  for (const v of vectors.parseLatLng) {
    it(`parse ${JSON.stringify(v.input)}`, () => expect(parseLatLng(v.input)).toEqual(v.expected))
  }
  it('parseLatLng tolerates null', () => expect(parseLatLng(null)).toBeNull())
})

describe('rankByDistance', () => {
  for (const c of vectors.rank.cases) {
    it(c.name, () => {
      const origin = (c as { origin?: { lat: number; lng: number } }).origin ?? vectors.rank.origin
      const out = rankByDistance(vectors.rank.items, origin, c.options)
      expect(out.map((r) => r.item.id)).toEqual(c.ids)
    })
  }
  it('radius is inclusive at the exact computed distance', () => {
    const origin = { lat: 10, lng: 20 }
    const item = { lat: 11, lng: 20 }
    const d = distanceKm(origin, item)
    expect(rankByDistance([item], origin, { radiusKm: d })).toHaveLength(1)
    expect(rankByDistance([item], origin, { radiusKm: d - 1e-9 })).toHaveLength(0)
  })
  it('returns distances and supports getPoint', () => {
    const rows = [{ name: 'a', where: { lat: 11, lng: 20 } }]
    const out = rankByDistance(rows, { lat: 10, lng: 20 }, { getPoint: (r) => r.where })
    expect(out[0]!.distanceKm).toBeCloseTo(111.195, 2)
    expect(out[0]!.item.name).toBe('a')
  })
  it('does not mutate the input', () => {
    const items = [...vectors.rank.items]
    rankByDistance(items, vectors.rank.origin)
    expect(items).toEqual(vectors.rank.items)
  })
})

describe('formatDistance', () => {
  for (const v of vectors.formatDistance) {
    it(`${v.km} km ${v.locale}`, () => expect(formatDistance(v.km, v.locale)).toBe(v.text))
  }
})

describe('directionsUrl', () => {
  for (const v of vectors.directionsUrl) {
    it(`${v.provider} ${JSON.stringify(v.location)}`, () =>
      expect(directionsUrl(v.location, { provider: v.provider as 'google' | 'apple' | 'geo' })).toBe(v.url))
  }
  it('defaults to google', () => {
    expect(directionsUrl({ lat: 19.4, lng: -99.1 })).toContain('google.com/maps/dir')
  })
})

describe('openStatus', () => {
  for (const v of vectors.openStatus) {
    it(v.name, () => {
      const s = openStatus(hoursOf(v.hours), v.tz, new Date(v.now))
      expect(s.open).toBe(v.open)
      expect(s.closesAt === null ? null : Date.parse(s.closesAt)).toBe(v.closesAt === null ? null : Date.parse(v.closesAt))
      expect(s.nextOpenAt === null ? null : Date.parse(s.nextOpenAt)).toBe(v.nextOpenAt === null ? null : Date.parse(v.nextOpenAt))
    })
  }
  it('no hours means closed with no next opening', () => {
    expect(openStatus({ weekly: [] }, 'America/Mexico_City', new Date('2025-06-04T18:00:00Z'))).toEqual({
      open: false, closesAt: null, nextOpenAt: null,
    })
  })
  it('open all day (00:00-00:00) merges across days', () => {
    const h: OpeningHours = { weekly: [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, open: '00:00', close: '00:00' })) }
    const s = openStatus(h, 'America/Mexico_City', new Date('2025-06-04T18:00:00Z'))
    expect(s.open).toBe(true)
  })
  it('throws on an unknown time zone', () => {
    expect(() => openStatus({ weekly: [] }, 'Mars/Olympus')).toThrow(RangeError)
  })
})

describe('formatOpeningHours / toSchemaOpeningHours', () => {
  for (const v of vectors.formatOpeningHours) {
    it(`${v.hours} ${v.locale}`, () => expect(formatOpeningHours(hoursOf(v.hours), v.locale)).toBe(v.text))
  }
  for (const v of vectors.toSchemaOpeningHours) {
    it(`schema ${v.hours}`, () => expect(toSchemaOpeningHours(hoursOf(v.hours))).toEqual(v.strings))
  }
  it('empty hours', () => {
    expect(formatOpeningHours({ weekly: [] })).toBe('')
    expect(toSchemaOpeningHours({ weekly: [] })).toEqual([])
  })
  it('ignores malformed entries', () => {
    expect(toSchemaOpeningHours({ weekly: [{ day: 1, open: 'x', close: '10:00' }] })).toEqual([])
  })
})
